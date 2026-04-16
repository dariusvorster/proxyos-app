import { cfFetch } from './client'

export async function cfGetBotFightMode(token: string, zoneId: string): Promise<boolean> {
  const result = await cfFetch<{ value: string }>(token, `/zones/${zoneId}/settings/bot_fight_mode`)
  return result.value === 'on'
}

export async function cfSetBotFightMode(token: string, zoneId: string, enabled: boolean): Promise<void> {
  await cfFetch<unknown>(token, `/zones/${zoneId}/settings/bot_fight_mode`, {
    method: 'PATCH',
    body: JSON.stringify({ value: enabled ? 'on' : 'off' }),
  })
}

export async function cfCreateGeoIpBlockRule(
  token: string, zoneId: string, countries: string[], description = 'ProxyOS GeoIP block',
): Promise<void> {
  await cfFetch<unknown>(token, `/zones/${zoneId}/firewall/rules`, {
    method: 'POST',
    body: JSON.stringify([{
      filter: {
        expression: `(ip.geoip.country in {${countries.map(c => `"${c}"`).join(' ')}})`,
      },
      action: 'block',
      description,
    }]),
  })
}

export interface WafStatus {
  botFightMode: boolean
  zoneId: string
}

export async function cfGetWafStatus(token: string, zoneId: string): Promise<WafStatus> {
  const botFightMode = await cfGetBotFightMode(token, zoneId)
  return { botFightMode, zoneId }
}
