/* AirBridge local-interface policy, GPL-3.0-or-later. */
#ifndef AIRBRIDGE_NETWORK_H
#define AIRBRIDGE_NETWORK_H
#include <stdlib.h>
#include <string.h>

static int airbridge_prefix_equal(const unsigned char *a, const unsigned char *b,
                                 unsigned int bytes, unsigned int prefix) {
    if (!prefix || prefix > bytes * 8) return 0;
    unsigned int whole = prefix / 8, bits = prefix % 8;
    if (whole && memcmp(a, b, whole)) return 0;
    return !bits || ((a[whole] ^ b[whole]) & (0xff << (8 - bits))) == 0;
}
#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>

static const unsigned char *airbridge_address(const SOCKET_ADDRESS *address, int bytes) {
    if (!address->lpSockaddr) return NULL;
    if (bytes == 4 && address->lpSockaddr->sa_family == AF_INET)
        return (const unsigned char *)&((const struct sockaddr_in *)address->lpSockaddr)->sin_addr;
    if (bytes == 16 && address->lpSockaddr->sa_family == AF_INET6)
        return (const unsigned char *)&((const struct sockaddr_in6 *)address->lpSockaddr)->sin6_addr;
    return NULL;
}

/* Match a prefix on the very adapter owning the accepted socket's local address.
   Publicly formatted IPv6 addresses may still be on-link inside a home LAN.
   Enumerate all addresses on that adapter: temporary IPv6 addresses can be /128
   while another address on the same adapter supplies the actual /64 prefix. */
static int airbridge_onlink_peer(const unsigned char *local, int local_bytes,
                                const unsigned char *remote, int remote_bytes,
                                unsigned int remote_scope, unsigned int *scope) {
    static const unsigned char loopback6[16] = {0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1};
    if (local_bytes != remote_bytes || (remote_bytes != 4 && remote_bytes != 16)) return 0;
    if ((remote_bytes == 4 && remote[0] == 127) ||
        (remote_bytes == 16 && !memcmp(remote, loopback6, 16))) { *scope = 0; return 1; }
    ULONG size = 15000, status = ERROR_BUFFER_OVERFLOW;
    IP_ADAPTER_ADDRESSES *adapters = NULL;
    for (int attempt = 0; attempt < 3 && status == ERROR_BUFFER_OVERFLOW; ++attempt) {
        free(adapters); adapters = NULL;
        if (size > 1024 * 1024) return 0;
        adapters = (IP_ADAPTER_ADDRESSES *)malloc(size);
        if (!adapters) return 0;
        status = GetAdaptersAddresses(AF_UNSPEC, GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER,
                                     NULL, adapters, &size);
    }
    int allowed = 0;
    if (status == NO_ERROR) for (IP_ADAPTER_ADDRESSES *a = adapters; a && !allowed; a = a->Next) {
        if (a->OperStatus != IfOperStatusUp) continue;
        int owns_local = 0;
        for (IP_ADAPTER_UNICAST_ADDRESS *u = a->FirstUnicastAddress; u; u = u->Next) {
            const unsigned char *ip = airbridge_address(&u->Address, local_bytes);
            if (ip && !memcmp(ip, local, local_bytes)) { owns_local = 1; break; }
        }
        if (!owns_local) continue;
        int linklocal6 = remote_bytes == 16 && remote[0] == 0xfe && (remote[1] & 0xc0) == 0x80;
        if (linklocal6 && remote_scope && remote_scope != a->Ipv6IfIndex) continue;
        for (IP_ADAPTER_UNICAST_ADDRESS *u = a->FirstUnicastAddress; u; u = u->Next) {
            const unsigned char *ip = airbridge_address(&u->Address, remote_bytes);
            if (ip && airbridge_prefix_equal(ip, remote, remote_bytes, u->OnLinkPrefixLength)) {
                allowed = 1; *scope = linklocal6 ? a->Ipv6IfIndex : 0; break;
            }
        }
    }
    free(adapters);
    return allowed;
}
#endif
#endif
