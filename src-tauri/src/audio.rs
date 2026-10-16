use serde::Serialize;
use windows::Win32::{
    Devices::FunctionDiscovery::PKEY_Device_FriendlyName, Media::Audio::*,
    System::Com::StructuredStorage::PropVariantToStringAlloc, System::Com::*,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}
// COM values stay on this thread; only owned strings cross the command boundary.
pub fn devices() -> Result<Vec<OutputDevice>, String> {
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED)
            .ok()
            .map_err(|e| e.to_string())?;
        struct Apartment;
        impl Drop for Apartment {
            fn drop(&mut self) {
                unsafe {
                    CoUninitialize();
                }
            }
        }
        let _apartment = Apartment;
        let en: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
        let default_id = en
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .ok()
            .and_then(|d| endpoint_id(&d).ok());
        let list = en
            .EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)
            .map_err(|e| e.to_string())?;
        let mut devices = Vec::new();
        for i in 0..list.GetCount().map_err(|e| e.to_string())? {
            let device = list.Item(i).map_err(|e| e.to_string())?;
            let id = endpoint_id(&device)?;
            let props = device
                .OpenPropertyStore(STGM_READ)
                .map_err(|e| e.to_string())?;
            let value = props
                .GetValue(&PKEY_Device_FriendlyName)
                .map_err(|e| e.to_string())?;
            let text = PropVariantToStringAlloc(&value).map_err(|e| e.to_string())?;
            let name = text
                .to_string()
                .unwrap_or_else(|_| "Windows audio device".into());
            CoTaskMemFree(Some(text.0.cast()));
            devices.push(OutputDevice {
                is_default: default_id.as_ref() == Some(&id),
                id,
                name,
            });
        }
        Ok(devices)
    }
}
unsafe fn endpoint_id(device: &IMMDevice) -> Result<String, String> {
    let id = device.GetId().map_err(|e| e.to_string())?;
    let text = id.to_string().map_err(|e| e.to_string());
    CoTaskMemFree(Some(id.0.cast()));
    text
}
pub fn sink(settings: &crate::settings::Settings) -> String {
    let buffer = match settings.buffer {
        crate::settings::Buffer::LowLatency => 40_000,
        crate::settings::Buffer::Balanced => 100_000,
        crate::settings::Buffer::Stable => 250_000,
    };
    let device = settings
        .output_id
        .as_ref()
        .map(|s| format!(" device=\"{s}\""))
        .unwrap_or_default();
    format!(
        "wasapisink{device} buffer-time={buffer} low-latency={}",
        settings.buffer == crate::settings::Buffer::LowLatency
    )
}

pub fn resolve_output<'a>(
    requested: Option<&str>,
    devices: &'a [OutputDevice],
) -> Option<&'a OutputDevice> {
    requested
        .and_then(|id| devices.iter().find(|d| d.id == id))
        .or_else(|| devices.iter().find(|d| d.is_default))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selection_follows_default_and_recovers_missing_output() {
        let devices = vec![
            OutputDevice {
                id: "one".into(),
                name: "Speakers".into(),
                is_default: true,
            },
            OutputDevice {
                id: "two".into(),
                name: "USB".into(),
                is_default: false,
            },
        ];
        assert_eq!(resolve_output(None, &devices).unwrap().id, "one");
        assert_eq!(resolve_output(Some("two"), &devices).unwrap().id, "two");
        assert_eq!(
            resolve_output(Some("unplugged"), &devices).unwrap().id,
            "one"
        );
        assert!(resolve_output(None, &[]).is_none());
    }
    #[test]
    fn native_enumeration_returns_owned_endpoint_ids() {
        for device in devices().unwrap() {
            assert!(!device.id.is_empty());
            assert!(!device.name.is_empty());
        }
    }
}
