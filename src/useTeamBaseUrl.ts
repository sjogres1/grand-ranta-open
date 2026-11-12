import { useEffect, useState } from 'react'

interface NetInfo {
  port: number | null
  addresses: { name: string; address: string }[]
}

/** Pick the laptop's real Wi-Fi/LAN address, skipping virtual adapters (WSL, VirtualBox, VPN…). */
function pickLanAddress(info: NetInfo): string | null {
  const virtual = /vethernet|virtual|vmware|vbox|wsl|hyper-v|docker|loopback|tailscale|zerotier/i
  const real = info.addresses.filter((a) => !virtual.test(a.name))
  return (real.find((a) => /wi-?fi|wlan|wireless/i.test(a.name)) ?? real[0])?.address ?? null
}

/**
 * Base address for team-page links. Online it's simply this site. On the laptop server (npm start)
 * it's the laptop's Wi-Fi address, so the links also work on players' phones.
 */
export function useTeamBaseUrl() {
  const [lan, setLan] = useState<{ ip: string; port: number } | null>(null)

  useEffect(() => {
    fetch('/api/info')
      .then((r) => r.json())
      .then((info: NetInfo) => {
        const ip = pickLanAddress(info)
        if (ip && info.port) setLan({ ip, port: info.port })
      })
      .catch(() => undefined)
  }, [])

  const onLaptopServer = lan !== null && window.location.port === String(lan.port)
  return {
    base: lan && onLaptopServer ? `http://${lan.ip}:${lan.port}` : window.location.origin,
    /** Set when running the dev setup (localhost links won't work on phones). */
    lanHint: lan && !onLaptopServer ? lan : null,
  }
}
