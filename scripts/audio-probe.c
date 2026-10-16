/* GPL-3.0-or-later. Developer-only component test using generated ALAC silence.
   Links the actual patched audio renderer, not a replacement playback path. */
#include <glib.h>
#include <stdio.h>
#include <stdlib.h>
#include "../vendor/uxplay/renderers/audio_renderer.h"

static GMainLoop *loop;
static gboolean finish(gpointer unused) { g_main_loop_quit(loop); return G_SOURCE_REMOVE; }
int main(int argc, char **argv) {
    if (argc < 2 || argc > 4) return 2;
    FILE *f = fopen(argv[1], "rb");
    if (!f) return 2;
    unsigned char packet[16384];
    int length = fread(packet,1,sizeof(packet),f); fclose(f);
    if (!length || packet[0] != 0x20) return 2;
    logger_t *log = logger_init();
    if (!gstreamer_init()) return 3;
    bool sync = false;
    audio_renderer_init(log, argc > 2 ? argv[2] : "wasapisink buffer-time=100000", &sync, &sync, "");
    if (argc > 3) audio_renderer_app_volume(0.0);
    loop = g_main_loop_new(NULL,FALSE);
    audio_renderer_listen(loop,0); audio_renderer_listen(loop,1);
    unsigned char codec = 2;
    audio_renderer_start(&codec);
    for (unsigned short seq = 0; seq < 100; ++seq) {
        int size = length;
        uint64_t time = g_get_real_time()*1000;
        audio_renderer_render_buffer(packet,&size,&seq,&time);
    }
    g_timeout_add_seconds(3,finish,NULL);
    g_main_loop_run(loop);
    audio_renderer_destroy();
    logger_destroy(log);
    return 0;
}
