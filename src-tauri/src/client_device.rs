//! Local hardware identifiers reported by the client, never guessed from its name.
//! Reference: DeviceKit's public identifier table (see docs/LOCAL_TESTING.md).
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientDevice {
    pub model: String,
    pub label: &'static str,
    pub kind: &'static str,
    pub shape: &'static str,
}
pub fn identify(model: &str) -> Option<ClientDevice> {
    if model.is_empty()
        || model.len() > 64
        || !model
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b',' || c == b'.')
    {
        return None;
    }
    let (label, shape) = match model {
        "iPhone9,1" | "iPhone9,3" => ("iPhone 7", "home"),
        "iPhone9,2" | "iPhone9,4" => ("iPhone 7 Plus", "home"),
        "iPhone10,1" | "iPhone10,4" => ("iPhone 8", "home"),
        "iPhone10,2" | "iPhone10,5" => ("iPhone 8 Plus", "home"),
        "iPhone10,3" | "iPhone10,6" => ("iPhone X", "notch"),
        "iPhone11,2" => ("iPhone XS", "notch"),
        "iPhone11,4" | "iPhone11,6" => ("iPhone XS Max", "notch"),
        "iPhone11,8" => ("iPhone XR", "notch"),
        "iPhone12,1" => ("iPhone 11", "notch"),
        "iPhone12,3" => ("iPhone 11 Pro", "notch"),
        "iPhone12,5" => ("iPhone 11 Pro Max", "notch"),
        "iPhone12,8" => ("iPhone SE (2nd generation)", "home"),
        "iPhone13,1" => ("iPhone 12 mini", "notch"),
        "iPhone13,2" => ("iPhone 12", "notch"),
        "iPhone13,3" => ("iPhone 12 Pro", "notch"),
        "iPhone13,4" => ("iPhone 12 Pro Max", "notch"),
        "iPhone14,4" => ("iPhone 13 mini", "notch"),
        "iPhone14,5" => ("iPhone 13", "notch"),
        "iPhone14,2" => ("iPhone 13 Pro", "notch"),
        "iPhone14,3" => ("iPhone 13 Pro Max", "notch"),
        "iPhone14,6" => ("iPhone SE (3rd generation)", "home"),
        "iPhone14,7" => ("iPhone 14", "notch"),
        "iPhone14,8" => ("iPhone 14 Plus", "notch"),
        "iPhone15,2" => ("iPhone 14 Pro", "island"),
        "iPhone15,3" => ("iPhone 14 Pro Max", "island"),
        "iPhone15,4" => ("iPhone 15", "island"),
        "iPhone15,5" => ("iPhone 15 Plus", "island"),
        "iPhone16,1" => ("iPhone 15 Pro", "island"),
        "iPhone16,2" => ("iPhone 15 Pro Max", "island"),
        "iPhone17,3" => ("iPhone 16", "island"),
        "iPhone17,4" => ("iPhone 16 Plus", "island"),
        "iPhone17,1" => ("iPhone 16 Pro", "island"),
        "iPhone17,2" => ("iPhone 16 Pro Max", "island"),
        "iPhone17,5" => ("iPhone 16e", "notch"),
        "iPhone18,3" => ("iPhone 17", "island"),
        "iPhone18,1" => ("iPhone 17 Pro", "island"),
        "iPhone18,2" => ("iPhone 17 Pro Max", "island"),
        "iPhone18,4" => ("iPhone Air", "island"),
        "iPhone18,5" => ("iPhone 17e", "notch"),
        "iPad13,18" | "iPad13,19" => ("iPad (10th generation)", "tablet"),
        "iPad15,7" | "iPad15,8" => ("iPad (A16)", "tablet"),
        "iPad13,1" | "iPad13,2" => ("iPad Air (4th generation)", "tablet"),
        "iPad13,16" | "iPad13,17" => ("iPad Air (5th generation)", "tablet"),
        "iPad14,8" | "iPad14,9" => ("iPad Air 11-inch (M2)", "tablet"),
        "iPad14,10" | "iPad14,11" => ("iPad Air 13-inch (M2)", "tablet"),
        "iPad15,3" | "iPad15,4" => ("iPad Air 11-inch (M3)", "tablet"),
        "iPad15,5" | "iPad15,6" => ("iPad Air 13-inch (M3)", "tablet"),
        "iPad14,1" | "iPad14,2" => ("iPad mini (6th generation)", "tablet"),
        "iPad16,1" | "iPad16,2" => ("iPad mini (A17 Pro)", "tablet"),
        "iPad14,3" | "iPad14,4" => ("iPad Pro 11-inch (4th generation)", "tablet"),
        "iPad14,5" | "iPad14,6" => ("iPad Pro 12.9-inch (6th generation)", "tablet"),
        "iPad16,3" | "iPad16,4" => ("iPad Pro 11-inch (M4)", "tablet"),
        "iPad16,5" | "iPad16,6" => ("iPad Pro 13-inch (M4)", "tablet"),
        value if value.starts_with("iPhone") => ("iPhone", "phone"),
        value if value.starts_with("iPad") => ("iPad", "tablet"),
        value if value.starts_with("iPod") => ("iPod touch", "phone"),
        _ => ("AirPlay device", "generic"),
    };
    Some(ClientDevice {
        model: model.into(),
        label,
        shape,
        kind: if model.starts_with("iPad") {
            "tablet"
        } else if model.starts_with("iPhone") || model.starts_with("iPod") {
            "phone"
        } else {
            "other"
        },
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn identifiers_are_not_marketing_generation_numbers() {
        assert_eq!(identify("iPhone17,3").unwrap().label, "iPhone 16");
        assert_eq!(identify("iPhone18,3").unwrap().label, "iPhone 17");
        assert_eq!(identify("iPhone12,1").unwrap().shape, "notch");
        assert_eq!(identify("iPhone13,2").unwrap().label, "iPhone 12");
        assert_eq!(identify("iPad16,4").unwrap().kind, "tablet");
    }
    #[test]
    fn unknown_or_absent_model_is_never_guessed() {
        assert!(identify("").is_none());
        assert!(identify("iPhone\n18,3").is_none());
        assert!(identify(&"x".repeat(65)).is_none());
        assert_eq!(identify("iPhone99,9").unwrap().label, "iPhone");
        assert_eq!(identify("Mac99,1").unwrap().shape, "generic");
    }
}
