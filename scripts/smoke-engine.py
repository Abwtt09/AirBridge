"""Native engine smoke test. Does not claim iPhone or audible playback validation."""
import ctypes, json, os, plistlib, queue, socket, struct, subprocess, threading, time
from ctypes import wintypes
from pathlib import Path
root=Path(__file__).resolve().parents[1]
runtime=root/'engine/runtime'
env=os.environ.copy()
env['PATH']=str(runtime)+os.pathsep+env['PATH']
env['GST_PLUGIN_PATH']=env['GST_PLUGIN_SYSTEM_PATH']=str(runtime/'lib/gstreamer-1.0')
env['GST_PLUGIN_SCANNER']=str(runtime/'gst-plugin-scanner.exe')
events=queue.Queue(); logs=[]
proc=subprocess.Popen([str(runtime/'uxplay.exe'),'-n','AirBridge Test','-nh','-vs','0','-as','wasapisink buffer-time=100000','-async','no','-vsync','no','-p','5100','-nohold','-rc',str(root/'engine/empty.conf')],cwd=runtime,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',errors='replace',creationflags=0x08000000)
def read(stream):
    for line in stream:
        logs.append(line.strip())
        if line.startswith('AIRBRIDGE:'):events.put(json.loads(line[len('AIRBRIDGE:'):]))
for stream in [proc.stdout,proc.stderr]:threading.Thread(target=read,args=(stream,),daemon=True).start()
report={}
try:
    deadline=time.monotonic()+20
    while time.monotonic()<deadline:
        try:e=events.get(timeout=.3)
        except queue.Empty:
            if proc.poll() is not None:raise RuntimeError(f'Engine exited {proc.returncode}: {logs[-10:]}')
            continue
        if e['event']=='error':raise RuntimeError(e['detail'])
        if e['event']=='ready':break
    else:raise RuntimeError(f'No readiness event: {logs[-10:]}')
    report['nativeStartup']='passed'
    # Request real /info and parse the returned binary plist.
    with socket.create_connection(('127.0.0.1',5101),timeout=3) as s:
        s.sendall(b'GET /info RTSP/1.0\r\nCSeq: 1\r\nContent-Length: 0\r\n\r\n')
        response=b''
        while b'\r\n\r\n' not in response:response+=s.recv(4096)
        header,body=response.split(b'\r\n\r\n',1)
        assert b'200 OK' in header,header
        length=next(int(x.split(b':',1)[1]) for x in header.split(b'\r\n') if x.lower().startswith(b'content-length:'))
        while len(body)<length:body+=s.recv(4096)
        info=plistlib.loads(body[:length])
        assert info['name']=='AirBridge Test',info
        assert not int(info['features']) & (1<<7),'Mirroring must not be advertised'
    report['rtspInfo']='passed'
    deadline=time.monotonic()+3
    while time.monotonic()<deadline:
        diagnostics=[json.loads(line[len('AIRBRIDGE:'):])['detail'] for line in logs if line.startswith('AIRBRIDGE:') and json.loads(line[len('AIRBRIDGE:'):]).get('event')=='diagnostic']
        if 'Response 200' in diagnostics:break
        time.sleep(.05)
    assert 'TCP IPv4 connection arrived' in diagnostics,diagnostics
    assert 'Request GET /info' in diagnostics,diagnostics
    assert 'Response 200' in diagnostics,diagnostics
    report['sanitizedProtocolDiagnostics']='passed'
    # IPv6 may be a global-format address on the same LAN, not just ULA/link-local.
    ipv6_addresses=list(dict.fromkeys(x[4] for x in socket.getaddrinfo(socket.gethostname(),5101,socket.AF_INET6,socket.SOCK_STREAM)))
    tested_ipv6=[]
    for address in [('::1',5101,0,0)]+ipv6_addresses:
        with socket.socket(socket.AF_INET6,socket.SOCK_STREAM) as s:
            s.settimeout(3)
            s.connect(address)
            s.sendall(b'GET /info RTSP/1.0\r\nCSeq: 1\r\nContent-Length: 0\r\n\r\n')
            response=s.recv(4096)
            assert b'200 OK' in response,(address,response[:100])
            tested_ipv6.append(address[0])
    report['ipv6RtspInterfaces']=tested_ipv6
    conflict=subprocess.run(proc.args,cwd=runtime,env=env,input='stop\n',capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=10,creationflags=0x08000000)
    conflict_events=[json.loads(line[len('AIRBRIDGE:'):]) for line in conflict.stdout.splitlines() if line.startswith('AIRBRIDGE:')]
    assert not any(e['event']=='ready' for e in conflict_events),'Port conflict incorrectly reported readiness'
    assert any(e['event']=='error' for e in conflict_events),(conflict.stdout,conflict.stderr)
    report['portConflictDetection']='passed'
    # Ask mDNS for _raop._tcp.local using a unicast response request.
    # A local response proves responder behavior, not firewall reachability from an iPhone.
    qname=b''.join(bytes([len(x)])+x.encode() for x in '_raop._tcp.local'.split('.'))+b'\0'
    query=struct.pack('!HHHHHH',0xA1B2,0,1,0,0,0)+qname+struct.pack('!HH',12,0x8001)
    found=False
    addresses=list(dict.fromkeys(x[4][0] for x in socket.getaddrinfo(socket.gethostname(),None,socket.AF_INET)))
    for interface in addresses+['127.0.0.1']:
        with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as s:
            s.settimeout(.5);s.bind((interface,0))
            s.setsockopt(socket.IPPROTO_IP,socket.IP_MULTICAST_IF,socket.inet_aton(interface))
            s.sendto(query,('224.0.0.251' if interface!='127.0.0.1' else '127.0.0.1',5353))
            deadline=time.monotonic()+1.5
            while time.monotonic()<deadline:
                try: packet,_=s.recvfrom(9000)
                except TimeoutError: continue
                if b'AirBridge Test' in packet: found=True;break
        if found:break
    assert found,'No AirBridge mDNS response; other local receivers may also be present'
    report['mdnsProbeInterface']=interface
    report['mdnsProbeTransport']='multicast' if interface!='127.0.0.1' else 'loopback unicast'
    report['localMdnsResponse']='passed'
    # Control roundtrip must not terminate the receiver.
    proc.stdin.write('volume 0.25\ndisconnect\n');proc.stdin.flush();time.sleep(.3)
    assert proc.poll() is None
    report['controlChannel']='passed'
    # One short native-idle measurement, not a general performance promise.
    class Counters(ctypes.Structure):
        _fields_=[('cb',wintypes.DWORD),('PageFaultCount',wintypes.DWORD)]+[(name,ctypes.c_size_t) for name in ['PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage','QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage']]
    def cpu_seconds():
        times=[wintypes.FILETIME() for _ in range(4)]
        assert ctypes.windll.kernel32.GetProcessTimes(wintypes.HANDLE(proc._handle),*[ctypes.byref(t) for t in times])
        return sum((t.dwHighDateTime<<32)+t.dwLowDateTime for t in times[2:])/1e7
    time.sleep(2) # let startup / decoder initialization settle before the sample
    begin=cpu_seconds();clock=time.monotonic();time.sleep(5);elapsed=time.monotonic()-clock
    counters=Counters();counters.cb=ctypes.sizeof(counters)
    assert ctypes.windll.psapi.GetProcessMemoryInfo(wintypes.HANDLE(proc._handle),ctypes.byref(counters),counters.cb)
    report['nativeIdleSample']={'wallSeconds':round(elapsed,2),'cpuSeconds':round(cpu_seconds()-begin,4),'workingSetMiB':round(counters.WorkingSetSize/2**20,2),'scope':'UxPlay process only; no stream; excludes Tauri/WebView2; single host sample'}
finally:
    if proc.poll() is None:
        proc.stdin.write('stop\n');proc.stdin.flush()
        try:proc.wait(timeout=6)
        except subprocess.TimeoutExpired:proc.kill();raise RuntimeError('Graceful stop timed out')
    report['gracefulShutdown']='passed' if proc.returncode==0 else f'failed ({proc.returncode})'
    report['iPhoneDiscoveryAndAudio']='pending hardware validation'
    (root/'artifacts/engine-smoke.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
    if proc.returncode:print('\n'.join(logs[-12:]))
