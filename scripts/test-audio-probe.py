"""Generate silence, then verify ALAC decode, measured levels and WASAPI initialization."""
import json, os, subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
bin=root/'.tools/msys64/ucrt64/bin'
subprocess.run([str(bin/'ffmpeg.exe'),'-v','error','-f','lavfi','-i','anullsrc=r=44100:cl=stereo','-t','0.1','-c:a','alac','-sample_fmt','s16p','-y',str(root/'artifacts/silence.caf')],check=True)
info=json.loads(subprocess.check_output([str(bin/'ffprobe.exe'),'-v','error','-show_packets','-of','json',str(root/'artifacts/silence.caf')]))
# The final short frame includes an explicit sample count, independent of cookie frame size.
packet=info['packets'][-1]
raw=(root/'artifacts/silence.caf').read_bytes()
(root/'artifacts/alac-frame.bin').write_bytes(raw[int(packet['pos']):int(packet['pos'])+int(packet['size'])])
env=os.environ.copy();runtime=root/'engine/runtime'
env['PATH']=str(runtime)+os.pathsep+env['PATH']
env['GST_PLUGIN_PATH']=env['GST_PLUGIN_SYSTEM_PATH']=str(runtime/'lib/gstreamer-1.0')
env['GST_PLUGIN_SCANNER']=str(runtime/'gst-plugin-scanner.exe')
result=subprocess.run([str(root/'artifacts/audio-probe.exe'),str(root/'artifacts/alac-frame.bin')],env=env,capture_output=True,text=True,timeout=15)
events=[json.loads(line[len('AIRBRIDGE:'):]) for line in result.stdout.splitlines() if line.startswith('AIRBRIDGE:')]
assert result.returncode==0,(result.stdout,result.stderr)
assert not any(e['event']=='error' for e in events),events
assert any(e['event']=='audio' for e in events),(result.stdout,result.stderr)
assert all(e['level']<=0.001 for e in events if e['event']=='audio'),'Generated silence must not show fake levels'
report={'alacDecodeIntoPatchedRenderer':'passed','wasapiPipeline':'passed','measuredSilentLevels':'passed','audibleIPhonePlayback':'pending hardware validation','levelEvents':len([e for e in events if e['event']=='audio'])}
# Nonzero telemetry is tested with a discard sink so no test tone is audible.
subprocess.run([str(bin/'ffmpeg.exe'),'-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-af','volume=0.1','-ac','2','-t','0.1','-c:a','alac','-sample_fmt','s16p','-y',str(root/'artifacts/test-tone.caf')],check=True)
info=json.loads(subprocess.check_output([str(bin/'ffprobe.exe'),'-v','error','-show_packets','-of','json',str(root/'artifacts/test-tone.caf')]))
packet=info['packets'][-1];raw=(root/'artifacts/test-tone.caf').read_bytes()
(root/'artifacts/alac-tone.bin').write_bytes(raw[int(packet['pos']):int(packet['pos'])+int(packet['size'])])
for muted in [False,True]:
    args=[str(root/'artifacts/audio-probe.exe'),str(root/'artifacts/alac-tone.bin'),'fakesink']+(['mute'] if muted else [])
    result=subprocess.run(args,env=env,capture_output=True,text=True,timeout=15)
    events=[json.loads(line[len('AIRBRIDGE:'):]) for line in result.stdout.splitlines() if line.startswith('AIRBRIDGE:')]
    levels=[e['level'] for e in events if e['event']=='audio']
    assert result.returncode==0 and levels and not any(e['event']=='error' for e in events),(result.stdout,result.stderr)
    if muted:assert max(levels)<0.00001,levels
    else:assert max(levels)>0.0001,levels
report['nonzeroRmsWithDiscardSink']='passed'
report['appMuteProducesZeroRms']='passed'
(root/'artifacts/audio-probe.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
