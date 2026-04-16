export interface ZoneAnalytics {
  requests: { total: number; cached: number }
  bandwidth: { total: number; cached: number }
  threats: number
  pageviews: number
}

interface GraphQLSum {
  requests: number
  cachedRequests: number
  bytes: number
  cachedBytes: number
  threats: number
  pageViews: number
}

interface GraphQLResponse {
  data: {
    viewer: {
      zones: Array<{
        httpRequests1hGroups: Array<{ sum: GraphQLSum }>
      }>
    }
  }
}

export async function cfGetZoneAnalytics(
  token: string, zoneId: string, since: Date, until: Date,
): Promise<ZoneAnalytics> {
  const query = `{
    viewer {
      zones(filter: { zoneTag: "${zoneId}" }) {
        httpRequests1hGroups(
          limit: 1
          filter: { datetime_geq: "${since.toISOString()}", datetime_leq: "${until.toISOString()}" }
        ) {
          sum { requests cachedRequests bytes cachedBytes threats pageViews }
        }
      }
    }
  }`

  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })

  const json = (await res.json()) as GraphQLResponse
  const sum = json.data?.viewer?.zones?.[0]?.httpRequests1hGroups?.[0]?.sum
  if (!sum) {
    return { requests: { total: 0, cached: 0 }, bandwidth: { total: 0, cached: 0 }, threats: 0, pageviews: 0 }
  }
  return {
    requests: { total: sum.requests, cached: sum.cachedRequests },
    bandwidth: { total: sum.bytes, cached: sum.cachedBytes },
    threats: sum.threats,
    pageviews: sum.pageViews,
  }
}
