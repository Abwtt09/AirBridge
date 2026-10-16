/* Native tests of the same prefix policy used by the receiver listener. */
#include <stdio.h>
#include "native/airbridge_network.h"
#define CHECK(x) do { if (!(x)) {fprintf(stderr,"Policy check failed at line %d\n",__LINE__); return 1;} } while (0)
int main(void) {
    unsigned char a[16] = {192,168,8,1}, b[16] = {192,168,8,2};
    CHECK(airbridge_prefix_equal(a,b,4,24));
    b[2] = 9; CHECK(!airbridge_prefix_equal(a,b,4,24));
    CHECK(!airbridge_prefix_equal(a,b,4,0));
    CHECK(!airbridge_prefix_equal(a,b,4,33));
    memset(a,0,16); memset(b,0,16); a[0]=b[0]=0x20; a[1]=b[1]=1; a[2]=b[2]=0x0d; a[3]=b[3]=0xb8;
    b[15]=1; CHECK(airbridge_prefix_equal(a,b,16,64));
    b[7]=1; CHECK(!airbridge_prefix_equal(a,b,16,64));
    b[7]=0; b[15]=1; CHECK(airbridge_prefix_equal(a,b,16,127));
    b[15]=2; CHECK(!airbridge_prefix_equal(a,b,16,127));
    CHECK(!airbridge_prefix_equal(a,b,16,129));
    unsigned int scope = 99;
    unsigned char localhost[4]={127,0,0,1};
    CHECK(airbridge_onlink_peer(localhost,4,localhost,4,0,&scope) && scope==0);
    unsigned char localhost6[16]={0}; localhost6[15]=1;
    CHECK(airbridge_onlink_peer(localhost6,16,localhost6,16,0,&scope));
    CHECK(!airbridge_onlink_peer(localhost,4,localhost6,16,0,&scope));

    ULONG size=128*1024;
    IP_ADAPTER_ADDRESSES *adapters=malloc(size);
    CHECK(adapters && GetAdaptersAddresses(AF_UNSPEC,0,NULL,adapters,&size)==NO_ERROR);
    unsigned int v4=0,v6=0,global6=0;
    for (IP_ADAPTER_ADDRESSES *adapter=adapters; adapter; adapter=adapter->Next) {
        if (adapter->OperStatus!=IfOperStatusUp) continue;
        for (IP_ADAPTER_UNICAST_ADDRESS *u=adapter->FirstUnicastAddress;u;u=u->Next) {
            int bytes=u->Address.lpSockaddr->sa_family==AF_INET?4:16;
            const unsigned char *local=airbridge_address(&u->Address,bytes);
            if (!local || !u->OnLinkPrefixLength || u->OnLinkPrefixLength>=bytes*8 || (bytes==4&&local[0]==127)) continue;
            unsigned char peer[16]; memcpy(peer,local,bytes); peer[bytes-1]^=1;
            scope=0;
            CHECK(airbridge_onlink_peer(local,bytes,peer,bytes,0,&scope));
            if(bytes==16 && local[0]==0xfe && (local[1]&0xc0)==0x80) {
                CHECK(scope==adapter->Ipv6IfIndex);
                CHECK(!airbridge_onlink_peer(local,bytes,peer,bytes,adapter->Ipv6IfIndex+1,&scope));
            }
            unsigned char offlink[16]={8,8,8,8};
            if(bytes==16) { memset(offlink,0,16); offlink[0]=0x30; offlink[15]=1; }
            CHECK(!airbridge_onlink_peer(local,bytes,offlink,bytes,0,&scope));
            if(bytes==4) ++v4;
            else {++v6; if((local[0]&0xe0)==0x20) ++global6;}
        }
    }
    free(adapters);
    printf("Prefix boundaries, loopback, family mismatch and off-link rejection passed; on-link IPv4=%u IPv6=%u global-format IPv6=%u\n",v4,v6,global6);
    return 0;
}
