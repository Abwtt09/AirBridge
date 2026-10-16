/* Test the real receiver UDP fallback, including the sender-address buffer. */
#include <winsock2.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "../vendor/uxplay/lib/raop_ntp.h"
int main(void) {
    WSADATA data;
    if (WSAStartup(MAKEWORD(2,2), &data)) return 1;
    SOCKET receiver = socket(AF_INET, SOCK_DGRAM, 0), sender = socket(AF_INET, SOCK_DGRAM, 0);
    struct sockaddr_in local = {0}, peer = {0};
    local.sin_family = AF_INET; local.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (bind(receiver, (struct sockaddr*)&local, sizeof(local))) return 2;
    int length = sizeof(local);
    if (getsockname(receiver, (struct sockaddr*)&local, &length)) return 3;
    DWORD timeout = 1000;
    setsockopt(receiver, SOL_SOCKET, SO_RCVTIMEO, (const char*)&timeout, sizeof(timeout));
    kernel_timestamp_session_t session = {0};
    session.sock_fd = (int)receiver; // NULL WSARecvMsg pointer deliberately forces fallback.
    const char payload[] = "synthetic-udp-probe";
    for (int i=0; i<3; ++i) {
        if (sendto(sender, payload, sizeof(payload), 0, (struct sockaddr*)&local, sizeof(local)) < 0) return 4;
        char buffer[64] = {0}; int peer_length = sizeof(peer);
        uint64_t timestamp = 0;
        ssize_t received = kernel_timestamp_session_recv(&session, buffer, sizeof(buffer),
            i == 1 ? NULL : &peer, i == 1 ? NULL : &peer_length, NULL, &timestamp);
        if (received != sizeof(payload) || memcmp(buffer, payload, sizeof(payload)) || !timestamp) {
            fprintf(stderr, "UDP fallback failed: result=%lld WSA=%d\n", (long long)received, WSAGetLastError()); return 5;
        }
        if (i != 1 && (peer_length != sizeof(peer) || peer.sin_addr.s_addr != htonl(INADDR_LOOPBACK))) return 6;
    }
    closesocket(sender); closesocket(receiver); WSACleanup();
    puts("UDP fallback: sender-address and NULL-address reads passed");
    return 0;
}
