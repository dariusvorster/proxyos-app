// nginx variable → caddy placeholder mapping.
//
// nginx uses $variable syntax. Caddy uses {placeholder} syntax. This table
// covers the safe subset (~30 variables that are unambiguous).
//
// Variables not in this table get substituted as {literal} with a warning.

export const VARIABLE_MAP: Record<string, string> = {
  // request basics
  '$host': '{host}',
  '$http_host': '{host}',
  '$server_name': '{host}',
  '$server_port': '{server_port}',
  '$scheme': '{scheme}',
  '$request_method': '{method}',
  '$request_uri': '{uri}',
  '$uri': '{path}',
  '$args': '{query}',
  '$query_string': '{query}',
  '$is_args': '{?}',  // approximate

  // remote
  '$remote_addr': '{remote_host}',
  '$remote_port': '{remote_port}',
  '$remote_user': '{user}',  // basic auth user

  // request body
  '$content_length': '{>Content-Length}',
  '$content_type': '{>Content-Type}',
  '$body_bytes_sent': '{size}',

  // common headers — note the >Header syntax for inbound
  '$http_user_agent': '{>User-Agent}',
  '$http_referer': '{>Referer}',
  '$http_x_real_ip': '{>X-Real-IP}',
  '$http_x_forwarded_for': '{>X-Forwarded-For}',
  '$http_x_forwarded_proto': '{>X-Forwarded-Proto}',
  '$http_authorization': '{>Authorization}',
  '$http_cookie': '{>Cookie}',

  // proxy-specific
  '$proxy_add_x_forwarded_for': '{>X-Forwarded-For}',  // Caddy auto-appends

  // response
  '$status': '{status}',

  // misc
  '$request_id': '{uuid}',
  '$time_iso8601': '{time}',
  '$msec': '{time_unix_ms}',
  '$pid': '{server_pid}',
}

/**
 * Substitute nginx variables in a string with caddy placeholders.
 * Returns the substituted string + the list of variables that had no mapping.
 */
export function substituteVariables(text: string): {
  result: string
  unknownVariables: string[]
} {
  const unknownVariables: string[] = []
  // Match $name where name is alphanumeric/underscore. Also match ${name} form.
  const result = text.replace(/\$\{?([a-z_][a-z0-9_]*)\}?/gi, (full, name) => {
    const varKey = '$' + name
    if (varKey in VARIABLE_MAP) {
      return VARIABLE_MAP[varKey]
    }
    // Header pattern: $http_X → {>X}
    if (name.startsWith('http_')) {
      const headerName = name.slice(5).split('_').map(toCapitalCase).join('-')
      return `{>${headerName}}`
    }
    // Unknown — pass through as literal {name} with note
    unknownVariables.push(varKey)
    return `{${name}}`
  })
  return { result, unknownVariables }
}

function toCapitalCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}
