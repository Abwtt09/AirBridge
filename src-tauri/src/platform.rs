use windows::Win32::{
    Foundation::{CloseHandle, HANDLE},
    System::{JobObjects::*, Threading::*},
};

pub struct ProcessJob(HANDLE);
unsafe impl Send for ProcessJob {}
impl ProcessJob {
    pub fn attach(pid: u32) -> Result<Self, String> {
        unsafe {
            let handle = CreateJobObjectW(None, None).map_err(|e| e.to_string())?;
            let job = Self(handle);
            let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                (&info as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of_val(&info) as u32,
            )
            .map_err(|e| e.to_string())?;
            let process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, pid)
                .map_err(|e| e.to_string())?;
            let result = AssignProcessToJobObject(handle, process);
            let _ = CloseHandle(process);
            result.map_err(|e| e.to_string())?;
            Ok(job)
        }
    }
}
impl Drop for ProcessJob {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn job_terminates_owned_child() {
        let mut child = std::process::Command::new("ping.exe")
            .args(["-t", "127.0.0.1"])
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let job = ProcessJob::attach(child.id()).unwrap();
        assert!(child.try_wait().unwrap().is_none());
        drop(job);
        let start = std::time::Instant::now();
        child.wait().unwrap();
        assert!(start.elapsed() < std::time::Duration::from_secs(2));
    }
}
