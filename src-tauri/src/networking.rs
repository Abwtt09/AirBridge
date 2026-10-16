use std::{ffi::c_void, sync::Arc};
use tokio::sync::Notify;
use windows::Win32::{
    Foundation::HANDLE, NetworkManagement::IpHelper::*, Networking::WinSock::AF_UNSPEC,
};

pub fn local_ips() -> Vec<String> {
    let mut ips: Vec<_> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|a| !a.is_loopback())
        .filter_map(|a| match a.ip() {
            std::net::IpAddr::V4(ip) if ip.is_private() || ip.is_link_local() => {
                Some(ip.to_string())
            }
            std::net::IpAddr::V6(ip) if ip.is_unique_local() || ip.is_unicast_link_local() => {
                Some(ip.to_string())
            }
            _ => None,
        })
        .collect();
    ips.sort();
    ips.dedup();
    ips
}
pub struct NetworkWatch {
    handle: HANDLE,
    context: *mut Arc<Notify>,
}
unsafe impl Send for NetworkWatch {}
impl NetworkWatch {
    pub fn new(notify: Arc<Notify>) -> Result<Self, String> {
        unsafe {
            let context = Box::into_raw(Box::new(notify));
            let mut handle = HANDLE::default();
            let result = NotifyUnicastIpAddressChange(
                AF_UNSPEC,
                Some(changed),
                Some(context.cast()),
                false,
                &mut handle,
            );
            if result.0 != 0 {
                drop(Box::from_raw(context));
                return Err(format!("Network notifications unavailable: {}", result.0));
            }
            Ok(Self { handle, context })
        }
    }
}
unsafe extern "system" fn changed(
    context: *const c_void,
    _row: *const MIB_UNICASTIPADDRESS_ROW,
    _kind: MIB_NOTIFICATION_TYPE,
) {
    if !context.is_null() {
        (&*context.cast::<Arc<Notify>>()).notify_one();
    }
}
impl Drop for NetworkWatch {
    fn drop(&mut self) {
        unsafe {
            let _ = CancelMibChangeNotify2(self.handle);
            drop(Box::from_raw(self.context));
        }
    }
}
