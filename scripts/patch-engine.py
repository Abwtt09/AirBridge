"""Small, reproducible AirBridge integration patch over pinned UxPlay sources.
GPL-3.0-or-later. Fails if upstream context changes; safe to run again.
"""
from pathlib import Path
import sys
root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'vendor' / 'uxplay'

def edit(path, changes):
    p = root / path
    s = p.read_text(encoding='utf-8')
    if 'AIRBRIDGE_PATCH' in s:
        return
    for before, after in changes:
        assert before in s, f'Patch context missing in {path}: {before[:80]}'
        s = s.replace(before, after, 1)
    p.write_text('/* AIRBRIDGE_PATCH: GPL-3.0-or-later, see scripts/patch-engine.py */\n' + s, encoding='utf-8')

edit('renderers/audio_renderer.h', [('#endif', '''/* Structured events are exclusively local stdout IPC. */
void airbridge_event(const char *event, const char *detail, double level);
void audio_renderer_app_volume(double gain);
#endif''')])

helpers = r'''
/* No audio or client identifiers are persisted. UTF-8 is retained; JSON controls escaped. */
void airbridge_event(const char *event, const char *detail, double level) {
    static GMutex lock;
    GString *s = g_string_new("");
    const unsigned char *p = (const unsigned char *)(detail ? detail : "");
    for (int n = 0; *p && n < 256; ++p, ++n) {
        if (*p == '"' || *p == '\\') g_string_append_c(s, '\\');
        if (*p < 32) g_string_append_printf(s, "\\u%04x", *p);
        else g_string_append_c(s, *p);
    }
    g_mutex_lock(&lock);
    printf("AIRBRIDGE:{\"event\":\"%s\",\"detail\":\"%s\",\"level\":%.6f}\n",
           event, s->str, isfinite(level) ? level : 0.0);
    fflush(stdout);
    g_mutex_unlock(&lock);
    g_string_free(s, TRUE);
}
static double app_gain = 1.0;
void audio_renderer_app_volume(double gain) {
    if (!isfinite(gain)) return;
    app_gain = fmax(0.0, fmin(1.0, gain));
    for (int i = 0; i < NFORMATS; ++i)
        if (renderer_type[i] && renderer_type[i]->volume)
            g_object_set(renderer_type[i]->volume, "volume", volume_level * app_gain, NULL);
}
'''
edit('renderers/audio_renderer.c', [
    ('#include <math.h>', '#include <math.h>\n#include <stdio.h>'),
    ('static audio_renderer_t *renderer = NULL;', 'static audio_renderer_t *renderer = NULL;\n' + helpers),
    ('"level ! "', '"level interval=100000000 post-messages=true ! "'),
    ('"volume", volume_level, NULL', '"volume", volume_level * app_gain, NULL'),
    ('void audio_renderer_stop() {', 'void audio_renderer_stop() {\n    airbridge_event("paused", "", 0);'),
    ('void  audio_renderer_start(unsigned char *ct) {', 'void  audio_renderer_start(unsigned char *ct) {\n    airbridge_event("connected", "", 0);'),
    ('void audio_renderer_set_volume(double volume) {\n    if (!renderer) {\n       return;\n    }', 'void audio_renderer_set_volume(double volume) {'),
    ('g_object_set(renderer_type[i]->volume, "volume", volume_level, NULL);', 'g_object_set(renderer_type[i]->volume, "volume", volume_level * app_gain, NULL);'),
    ('logger_log(logger, LOGGER_INFO, "GStreamer error (audio): %s %s", GST_MESSAGE_SRC_NAME(message),err->message);', 'airbridge_event("error", err->message, 0);\n        logger_log(logger, LOGGER_INFO, "GStreamer error (audio): %s %s", GST_MESSAGE_SRC_NAME(message),err->message);'),
    ('if (renderer->appsrc) {', 'if (renderer && renderer->appsrc) {'),
    ('// many "level" messages may be sent', '''{
        const GstStructure *s = gst_message_get_structure(message);
        if (s && gst_structure_has_name(s, "level")) {
            const GValue *rms = gst_structure_get_value(s, "rms");
            double peak = 0.0;
            if (rms && GST_VALUE_HOLDS_LIST(rms)) {
                for (guint i = 0; i < gst_value_list_get_size(rms); ++i) {
                    double db = g_value_get_double(gst_value_list_get_value(rms, i));
                    peak = fmax(peak, isfinite(db) ? pow(10.0, db / 20.0) : 0.0);
                }
            } else if (rms && G_VALUE_HOLDS(rms, G_TYPE_VALUE_ARRAY)) {
                GValueArray *a = (GValueArray *)g_value_get_boxed(rms);
                for (guint i = 0; a && i < a->n_values; ++i) {
                    double db = g_value_get_double(g_value_array_get_nth(a, i));
                    peak = fmax(peak, isfinite(db) ? pow(10.0, db / 20.0) : 0.0);
                }
            }
            airbridge_event("audio", "", fmin(1.0, peak));
        }
      }''')
])

ipc = r'''
/* Commands are from the owning Rust process, never from a network socket. */
static gboolean airbridge_command(gpointer data) {
    char *line = (char *)data;
    if (!strcmp(line, "stop")) {
        if (!gmainloop) return G_SOURCE_CONTINUE;
        relaunch_video = false;
        g_main_loop_quit(gmainloop);
    } else if (!strcmp(line, "disconnect")) {
        raop_remove_known_connections(raop);
        audio_renderer_stop();
        airbridge_event("idle", "", 0);
    } else {
        double gain;
        if (sscanf(line, "volume %lf", &gain) == 1) audio_renderer_app_volume(gain);
    }
    g_free(line);
    return G_SOURCE_REMOVE;
}
static gpointer airbridge_stdin(gpointer unused) {
    char line[128];
    while (fgets(line, sizeof(line), stdin)) {
        line[strcspn(line, "\r\n")] = 0;
        g_idle_add(airbridge_command, g_strdup(line));
    }
    g_idle_add(airbridge_command, g_strdup("stop"));
    return NULL;
}
'''
edit('uxplay.cpp', [
    ('static BOOL WINAPI CtrlHandler(DWORD signal) {', ipc + '\nstatic BOOL WINAPI CtrlHandler(DWORD signal) {'),
    ('    std::vector<char> server_hw_addr;', '    g_thread_unref(g_thread_new("airbridge-control", airbridge_stdin, NULL));\n    std::vector<char> server_hw_addr;'),
    ('    if (open_connections == 0) {', '    if (open_connections == 0) {\n        airbridge_event("idle", "", 0);'),
    ('    // Pass device model to renderer for device frame display', '    if (*admit) airbridge_event("connecting", name, 0);\n    // Pass device model to renderer for device frame display'),
    ('    if (register_dnssd()) {\n        stop_raop_server();\n        stop_dnssd();\n        cleanup();\n    }', '    if (register_dnssd()) {\n        airbridge_event("error", "mDNS service registration failed", 0);\n        stop_raop_server();\n        stop_dnssd();\n        cleanup();\n        return 1;\n    }\n    airbridge_event("ready", "Local service registered; iPhone discovery unverified", 0);'),
])

edit('lib/httpd.c', [
    ('    // is it correct that ipv6 link-local', '''    /* Restrict this audio utility to private/link-local/loopback peers by default.
       Windows Firewall rules additionally restrict to Private profile + LocalSubnet. */
    int allowed = 0;
    if (remote_len == 4) {
        allowed = remote[0] == 10 || remote[0] == 127 ||
            (remote[0] == 172 && remote[1] >= 16 && remote[1] <= 31) ||
            (remote[0] == 192 && remote[1] == 168) ||
            (remote[0] == 169 && remote[1] == 254);
    } else if (remote_len == 16) {
        allowed = (remote[0] & 0xfe) == 0xfc ||
            (remote[0] == 0xfe && (remote[1] & 0xc0) == 0x80);
        const unsigned char loopback[16] = {0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1};
        allowed |= memcmp(remote, loopback, 16) == 0;
    }
    if (!allowed || local_zone_id != remote_zone_id) {
        shutdown(fd, SHUT_RDWR);
        CLOSESOCKET(fd);
        return 0;
    }
    // is it correct that ipv6 link-local'''),
])
# These follow-up edits are idempotent on both a clean checkout and an already patched one.
def amend(path, changes):
    p = root / path
    s = p.read_text(encoding='utf-8')
    for before, after in changes:
        if after in s:
            continue
        if before in s:
            s = s.replace(before, after, 1)
        else:
            assert after in s, f'Additional patch context missing in {path}'
    p.write_text(s, encoding='utf-8')

amend('renderers/audio_renderer.c', [
    ('"app", "libav", "playback", "autodetect", "videoparsersbad",', '"app", "libav", "level", "wasapi",'),
    ('"plugins-base", "libav", "plugins-base", "plugins-good", "plugins-bad",', '"plugins-base", "libav", "plugins-good", "plugins-bad",'),
    ('static double app_gain = 1.0;', 'static double app_gain = 1.0;\nstatic GMutex gain_lock;'),
    ('    app_gain = fmax', '    g_mutex_lock(&gain_lock);\n    app_gain = fmax'),
    ('volume_level * app_gain, NULL);\n}\n', 'volume_level * app_gain, NULL);\n    g_mutex_unlock(&gain_lock);\n}\n'),
    ('void audio_renderer_set_volume(double volume) {', 'void audio_renderer_set_volume(double volume) {\n    g_mutex_lock(&gain_lock);'),
    ('}\n\nvoid audio_renderer_flush()', '    g_mutex_unlock(&gain_lock);\n}\n\nvoid audio_renderer_flush()'),
    ('    airbridge_event("connected", "", 0);\n    int id = -1;\n    get_renderer_type(ct, &id);', '    int id = -1;\n    get_renderer_type(ct, &id);\n    if (id >= 0 && render_audio) airbridge_event("connected", "", 0);\n    else airbridge_event("error", "Unsupported or unavailable AirPlay audio codec", 0);'),
    ('        g_assert (renderer_type[i]->pipeline);', '''        g_assert (renderer_type[i]->pipeline);
        if (gst_element_set_state(renderer_type[i]->pipeline, GST_STATE_READY) == GST_STATE_CHANGE_FAILURE) {
            airbridge_event("error", "WASAPI output initialization failed. Check the selected playback device.", 0);
            exit(1);
        }'''),
])
amend('uxplay.cpp', [
    ('    raop_start_httpd(raop, &raop_port);', '''    if (raop_start_httpd(raop, &raop_port) < 0) {
        airbridge_event("error", "Cannot bind the receiver listener. TCP port 5101 may be in use.", 0);
        return -1;
    }'''),
    ('    /* bit 27 of Features', '''    /* AirBridge currently offers audio reception only. */
    for (int bit : {0, 1, 2, 4, 5, 7, 8, 42}) dnssd_set_airplay_features(dnssd, bit, 0);

    /* bit 27 of Features'''),
])
amend('lib/httpd.c', [
    ('recv(connection->socket_fd, buffer, sizeof(buffer), 0)', 'recv(connection->socket_fd, buffer, sizeof(buffer) - 1, 0)'),
    ('        for (int i = 0; i < httpd->max_connections; i++) {\n            int recv_datalen', '        for (int i = 0; i < httpd->max_connections; i++) {\n            int recv_datalen'),
    ('                httpd_remove_connection(httpd, connection, 0);\n            }\n            /* If not', '                httpd_remove_connection(httpd, connection, 0);\n                continue;\n            }\n            /* If not'),
])
amend('lib/http_request.c', [
    ('    int complete;', '    int complete;\n    size_t wire_bytes;\n    size_t header_bytes;'),
    ('    char *new_url = realloc', '    if (length > 4096 || request->url_len > 4096 - length) return HPE_USER;\n    char *new_url = realloc'),
    ('    /* Check if our index is a value */', '    if (length > 65536 || request->header_bytes > 65536 - length || request->headers_index >= 256) return HPE_USER;\n    request->header_bytes += length;\n    /* Check if our index is a value */'),
    ('    /* Check if our index is a field */', '    if (length > 65536 || request->header_bytes > 65536 - length) return HPE_USER;\n    request->header_bytes += length;\n    /* Check if our index is a field */'),
    ('    int ret = llhttp_execute', '    if (datalen <= 0 || datalen > 4*1024*1024 || request->wire_bytes > 4*1024*1024 - (size_t)datalen) return -1;\n    request->wire_bytes += (size_t)datalen;\n    int ret = llhttp_execute'),
])
amend('lib/raop_handlers.h', [
    ('        memcpy(proof, client_proof, sizeof(proof));', '''        if (!client_proof || client_proof_len != sizeof(proof)) {
            free(client_proof); free(client_pk); plist_free(req_root_node);
            http_response_init(response, "RTSP/1.0", 470, "Client Authentication Failure");
            return;
        }
        memcpy(proof, client_proof, sizeof(proof));'''),
    ('        memcpy(epk, client_epk, ED25519_KEY_SIZE);', '''        if (!client_epk || !client_authtag || client_epk_len != ED25519_KEY_SIZE || client_authtag_len != GCM_AUTHTAG_SIZE) {
            free(client_epk); free(client_authtag); plist_free(req_root_node);
            http_response_init(response, "RTSP/1.0", 470, "Client Authentication Failure");
            return;
        }
        memcpy(epk, client_epk, ED25519_KEY_SIZE);'''),
    ('        memcpy(aesiv, eiv, 16);', '''        if (!eiv || eiv_len != 16) {
            free(eiv); plist_free(req_root_node); plist_free(res_root_node);
            http_response_init(response, "RTSP/1.0", 400, "Invalid encryption IV");
            http_response_set_disconnect(response, 1); return;
        }
        memcpy(aesiv, eiv, 16);'''),
    ('        memcpy(eaeskey,ekey,72);', '''        if (!ekey || ekey_len != 72) {
            free(ekey); plist_free(req_root_node); plist_free(res_root_node);
            http_response_init(response, "RTSP/1.0", 400, "Invalid encryption key");
            http_response_set_disconnect(response, 1); return;
        }
        memcpy(eaeskey,ekey,72);'''),
])
amend('renderers/audio_renderer.c', [
    ('    const unsigned char *p = (const unsigned char *)(detail ? detail : "");\n    for (int n = 0; *p && n < 256; ++p, ++n) {', '''    const char *raw = detail ? detail : "";
    gchar *valid = g_utf8_make_valid(raw, MIN(strlen(raw), 240));
    const unsigned char *p = (const unsigned char *)valid;
    for (; *p; ++p) {'''),
    ('    g_string_free(s, TRUE);\n}', '    g_string_free(s, TRUE);\n    g_free(valid);\n}'),
    ('        logger_log(logger, LOGGER_ERR, "*** ERROR invalid  audio frame', '        gst_buffer_unref(buffer);\n        logger_log(logger, LOGGER_ERR, "*** ERROR invalid  audio frame'),
])
amend('renderers/audio_renderer.h', [
    ('extern "C" {\n/* Structured events', 'extern "C" {\n#endif\n/* Structured events'),
    ('void audio_renderer_app_volume(double gain);\n#endif\n\n#include <stdlib.h>', 'void audio_renderer_app_volume(double gain);\n\n#include <stdlib.h>'),
])
amend('renderers/audio_renderer.c', [
    ('        gst_pipeline_use_clock(GST_PIPELINE_CAST(renderer_type[i]->pipeline), clock);', '''        /* Probe output availability, then release idle audio clients until a session starts. */
        gst_element_set_state(renderer_type[i]->pipeline, GST_STATE_NULL);
        gst_pipeline_use_clock(GST_PIPELINE_CAST(renderer_type[i]->pipeline), clock);'''),
])
amend('lib/netutils.c', [
    ('#ifndef _WIN32\n    int reuseaddr = 1;\n#else\n    const char reuseaddr = 1;\n#endif', '/* AirBridge: Windows receiver ports must have one exclusive owner. */\n    const int reuseaddr = 1;'),
    ('    int ret = setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &reuseaddr, sizeof (reuseaddr));', '''#ifdef _WIN32
    int ret = setsockopt(server_fd, SOL_SOCKET, SO_EXCLUSIVEADDRUSE, (const char *)&reuseaddr, sizeof(reuseaddr));
#else
    int ret = setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &reuseaddr, sizeof(reuseaddr));
#endif'''),
])
amend('uxplay.cpp', [
    ('extern "C" void log_callback (void *cls, int level, const char *msg) {', '''extern "C" void log_callback (void *cls, int level, const char *msg) {
    /* Only explicitly sanitized protocol summaries enter the app diagnostics. */
    const char *prefix = "AirBridge diagnostic: ";
    if (!strncmp(msg, prefix, strlen(prefix))) {
        airbridge_event("diagnostic", msg + strlen(prefix), 0);
        return;
    }'''),
])
amend('lib/httpd.c', [
    ('    remote = netutils_get_address(&remote_saddr, &remote_len, &remote_zone_id, NULL);', '''    remote = netutils_get_address(&remote_saddr, &remote_len, &remote_zone_id, NULL);
    logger_log(httpd->logger, LOGGER_INFO, "AirBridge diagnostic: TCP %s connection arrived", is_ipv6 ? "IPv6" : "IPv4");'''),
    ('    if (!allowed || local_zone_id != remote_zone_id) {', '''    if (!allowed || local_zone_id != remote_zone_id) {
        logger_log(httpd->logger, LOGGER_INFO, "AirBridge diagnostic: TCP rejected by local-network address/scope policy");'''),
    ('    ret = httpd_add_connection(httpd, fd, local, local_len, remote, remote_len, local_zone_id);', '''    logger_log(httpd->logger, LOGGER_INFO, "AirBridge diagnostic: TCP connection accepted");
    ret = httpd_add_connection(httpd, fd, local, local_len, remote, remote_len, local_zone_id);'''),
])
amend('lib/raop.c', [
    ('#define MAX_HDR_FIELDS 20', '''    /* Allowlisted paths and methods only: no keys, headers, bodies, or query strings. */
    const char *ab_method = "other", *ab_path = "other";
    const char *ab_methods[] = {"GET", "POST", "OPTIONS", "SETUP", "RECORD", "FLUSH", "TEARDOWN", "SET_PARAMETER", "GET_PARAMETER"};
    const char *ab_paths[] = {"/info", "/pair-setup", "/pair-verify", "/fp-setup", "/feedback", "/auth-setup", "/command"};
    for (size_t i = 0; i < sizeof(ab_methods)/sizeof(ab_methods[0]); ++i)
        if (!strcmp(method, ab_methods[i])) ab_method = ab_methods[i];
    for (size_t i = 0; i < sizeof(ab_paths)/sizeof(ab_paths[0]); ++i)
        if (!strcmp(url, ab_paths[i])) ab_path = ab_paths[i];
    logger_log(raop->logger, LOGGER_INFO, "AirBridge diagnostic: Request %s %s", ab_method, ab_path);

#define MAX_HDR_FIELDS 20'''),
    ('    const char *data = http_response_get_data(*response, &len);', '''    const char *data = http_response_get_data(*response, &len);
    int ab_status = 0;
    if (data && len > 0) sscanf(data, "%*s %d", &ab_status);
    logger_log(raop->logger, LOGGER_INFO, "AirBridge diagnostic: Response %d", ab_status);'''),
])
amend('lib/raop_ntp.c', [
    ('(struct sockaddr*) src_addr, (socklen_t *) &addrlen);', '(struct sockaddr*) src_addr, (socklen_t *) addrlen);'),
])
amend('lib/raop_rtp.c', [
    ('    while(1) {\n        fd_set rfds;', '    bool ab_data_seen = false, ab_frame_seen = false;\n    unsigned long long ab_received = 0, ab_frames = 0;\n    raop_rtp->ab_resend_requests = 0;\n    uint64_t ab_report_at = raop_ntp_get_local_time() + 5000000000ULL;\n    while(1) {\n        fd_set rfds;'),
    ('                    logger_log(raop_rtp->logger, LOGGER_DEBUG, "first audio rtp sync");', '                    logger_log(raop_rtp->logger, LOGGER_INFO, "AirBridge diagnostic: First audio RTP sync received");\n                    logger_log(raop_rtp->logger, LOGGER_DEBUG, "first audio rtp sync");'),
    ('            if (packetlen < 12)  {', '''            if (packetlen >= 12 && !ab_data_seen) {
                ab_data_seen = true;
                logger_log(raop_rtp->logger, LOGGER_INFO, "AirBridge diagnostic: First audio UDP packet received");
            }
            if (packetlen < 12)  {'''),
    ('                    audio_decode_struct audio_data;', '''                    if (!ab_frame_seen) {
                        ab_frame_seen = true;
                        logger_log(raop_rtp->logger, LOGGER_INFO, "AirBridge diagnostic: First decrypted audio frame sent to decoder");
                    }
                    audio_decode_struct audio_data;'''),
])
amend('uxplay.cpp', [
    ('    if (*admit) airbridge_event("connecting", name, 0);', '''    if (*admit) {
        airbridge_event("connecting", name, 0);
        airbridge_event("model", model, 0);
    }'''),
])
amend('lib/raop_rtp.c', [
    ('    unsigned char ct;\n};', '    unsigned char ct;\n    unsigned long long ab_resend_requests; /* worker-thread-only diagnostic counter */\n};'),
    ('    logger_log(raop_rtp->logger, LOGGER_DEBUG, "raop_rtp got resend request %d %d", seqnum, count);', '    raop_rtp->ab_resend_requests += count;\n    logger_log(raop_rtp->logger, LOGGER_DEBUG, "raop_rtp got resend request %d %d", seqnum, count);'),
    ('    bool ab_data_seen = false, ab_frame_seen = false;', '''    bool ab_data_seen = false, ab_frame_seen = false;
    unsigned long long ab_received = 0, ab_frames = 0;
    raop_rtp->ab_resend_requests = 0;
    uint64_t ab_report_at = raop_ntp_get_local_time() + 5000000000ULL;'''),
    ('            int type_c = packet[1] & ~0x80;', '            if (packetlen < 2) continue; /* Includes failed recvfrom: never inspect stale packet bytes. */\n            int type_c = packet[1] & ~0x80;'),
    ('            if (packetlen >= 12 && !ab_data_seen) {', '''            if (packetlen >= 12) ++ab_received;
            uint64_t ab_now = raop_ntp_get_local_time();
            if (ab_now >= ab_report_at) {
                logger_log(raop_rtp->logger, LOGGER_INFO, "AirBridge diagnostic: Audio interval: UDP packets=%llu decoder frames=%llu requested retransmissions=%llu", ab_received, ab_frames, raop_rtp->ab_resend_requests);
                ab_received = ab_frames = raop_rtp->ab_resend_requests = 0;
                ab_report_at = ab_now + 5000000000ULL;
            }
            if (packetlen >= 12 && !ab_data_seen) {'''),
    ('                    if (!ab_frame_seen) {', '                    ++ab_frames;\n                    if (!ab_frame_seen) {'),
])
amend('uxplay.cpp', [
    ('    LOGI("ct=%d spf=%d usingScreen=%d isMedia=%d  audioFormat=0x%lx",*ct, *spf, *usingScreen, *isMedia, (unsigned long) *audioFormat);', '''    char ab_format[128];
    snprintf(ab_format, sizeof(ab_format), "Audio format: codec=%u samples/frame=%u", (unsigned int)*ct, (unsigned int)*spf);
    airbridge_event("diagnostic", ab_format, 0);
    LOGI("ct=%d spf=%d usingScreen=%d isMedia=%d  audioFormat=0x%lx",*ct, *spf, *usingScreen, *isMedia, (unsigned long) *audioFormat);'''),
])
network_header = (Path(__file__).resolve().parent / 'native/airbridge_network.h').read_text(encoding='utf-8')
network_target = root / 'lib/airbridge_network.h'
if not network_target.exists() or network_target.read_text(encoding='utf-8') != network_header:
    network_target.write_text(network_header, encoding='utf-8')
amend('lib/httpd.c', [
    ('#include "utils.h"', '#include "utils.h"\n#include "airbridge_network.h"'),
    ('    int allowed = 0;\n    if (remote_len == 4) {', '''#ifdef _WIN32
    /* AirBridge interface-prefix policy: accept on-link IPv4 AND IPv6 peers. */
    int allowed = airbridge_onlink_peer(local, local_len, remote, remote_len, remote_zone_id, &local_zone_id);
    remote_zone_id = local_zone_id; /* Scope already validated against the actual interface. */
#else
    int allowed = 0;
    if (remote_len == 4) {'''),
    ('        allowed |= memcmp(remote, loopback, 16) == 0;\n    }\n    if (!allowed', '        allowed |= memcmp(remote, loopback, 16) == 0;\n    }\n#endif\n    if (!allowed'),
])
print('AirBridge engine integration patch applied.')
