import type Database from 'better-sqlite3'

const DDL = [
  `CREATE TABLE IF NOT EXISTS routes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    upstream_type TEXT NOT NULL,
    upstreams TEXT NOT NULL,
    tls_mode TEXT NOT NULL DEFAULT 'auto',
    sso_enabled INTEGER NOT NULL DEFAULT 0,
    sso_provider_id TEXT,
    tls_dns_provider_id TEXT,
    rate_limit TEXT,
    ip_allowlist TEXT,
    basic_auth TEXT,
    headers TEXT,
    health_check_enabled INTEGER NOT NULL DEFAULT 1,
    health_check_path TEXT NOT NULL DEFAULT '/',
    health_check_interval INTEGER NOT NULL DEFAULT 30,
    compression_enabled INTEGER NOT NULL DEFAULT 1,
    websocket_enabled INTEGER NOT NULL DEFAULT 1,
    http2_enabled INTEGER NOT NULL DEFAULT 1,
    http3_enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    resource_name TEXT,
    actor TEXT NOT NULL DEFAULT 'user',
    detail TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sso_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    forward_auth_url TEXT NOT NULL,
    auth_response_headers TEXT NOT NULL DEFAULT '[]',
    trusted_ips TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_tested_at INTEGER,
    test_status TEXT NOT NULL DEFAULT 'unknown',
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS dns_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    credentials TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS certificates (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    issued_at INTEGER,
    expires_at INTEGER,
    auto_renew INTEGER NOT NULL DEFAULT 1,
    last_renewed_at INTEGER,
    route_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS traffic_metrics (
    id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL,
    bucket TEXT NOT NULL,
    bucket_ts INTEGER NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0,
    bytes INTEGER NOT NULL DEFAULT 0,
    errors INTEGER NOT NULL DEFAULT 0,
    status_2xx INTEGER NOT NULL DEFAULT 0,
    status_3xx INTEGER NOT NULL DEFAULT 0,
    status_4xx INTEGER NOT NULL DEFAULT 0,
    status_5xx INTEGER NOT NULL DEFAULT 0,
    latency_sum_ms INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS access_log (
    id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL,
    method TEXT,
    path TEXT,
    status_code INTEGER,
    latency_ms INTEGER,
    bytes_out INTEGER,
    client_ip TEXT,
    user_agent TEXT,
    recorded_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS alert_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    target_route_id TEXT,
    config TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_fired_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS alert_events (
    id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL,
    route_id TEXT,
    message TEXT NOT NULL,
    detail TEXT,
    fired_at INTEGER NOT NULL
  )`,
]

const V2_DDL = [
  `CREATE TABLE IF NOT EXISTS agents (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    site_tag      TEXT,
    description   TEXT,
    token_hash    TEXT NOT NULL,
    token_expires_at INTEGER NOT NULL,
    status        TEXT NOT NULL DEFAULT 'offline',
    last_seen     INTEGER,
    caddy_version TEXT,
    route_count   INTEGER NOT NULL DEFAULT 0,
    cert_count    INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS revoked_agent_tokens (
    token_hash  TEXT PRIMARY KEY,
    revoked_at  INTEGER NOT NULL,
    reason      TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS agent_metrics (
    agent_id    TEXT NOT NULL,
    route_id    TEXT NOT NULL,
    bucket      INTEGER NOT NULL,
    req_count   INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    p95_ms      INTEGER,
    bytes_in    INTEGER NOT NULL DEFAULT 0,
    bytes_out   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (agent_id, route_id, bucket)
  )`,
  `CREATE TABLE IF NOT EXISTS import_sessions (
    id          TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    route_count INTEGER NOT NULL DEFAULT 0,
    imported    INTEGER NOT NULL DEFAULT 0,
    skipped     INTEGER NOT NULL DEFAULT 0,
    failed      INTEGER NOT NULL DEFAULT 0,
    result_json TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS scanned_containers (
    id         TEXT PRIMARY KEY,
    agent_id   TEXT,
    name       TEXT NOT NULL,
    image      TEXT NOT NULL,
    last_seen  INTEGER NOT NULL,
    route_id   TEXT REFERENCES routes(id),
    strategy   TEXT,
    confidence TEXT
  )`,
]

const V3_DDL = [
  `CREATE TABLE IF NOT EXISTS connections (
    id           TEXT PRIMARY KEY,
    type         TEXT NOT NULL,
    name         TEXT NOT NULL,
    credentials  TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'disconnected',
    last_sync    INTEGER,
    last_error   TEXT,
    config       TEXT,
    created_at   INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS connection_sync_log (
    id             TEXT PRIMARY KEY,
    connection_id  TEXT NOT NULL REFERENCES connections(id),
    timestamp      INTEGER NOT NULL,
    result         TEXT,
    message        TEXT,
    duration_ms    INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS dns_records_shadow (
    id             TEXT PRIMARY KEY,
    connection_id  TEXT NOT NULL REFERENCES connections(id),
    zone_id        TEXT NOT NULL,
    name           TEXT NOT NULL,
    type           TEXT NOT NULL,
    value          TEXT NOT NULL,
    proxied        INTEGER NOT NULL DEFAULT 0,
    ttl            INTEGER,
    route_id       TEXT REFERENCES routes(id),
    synced_at      INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tunnel_rules (
    id             TEXT PRIMARY KEY,
    connection_id  TEXT NOT NULL REFERENCES connections(id),
    tunnel_id      TEXT NOT NULL,
    hostname       TEXT NOT NULL,
    service        TEXT NOT NULL,
    route_id       TEXT REFERENCES routes(id),
    created_at     INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS monitors (
    id             TEXT PRIMARY KEY,
    connection_id  TEXT NOT NULL REFERENCES connections(id),
    route_id       TEXT NOT NULL REFERENCES routes(id),
    url            TEXT NOT NULL,
    status         TEXT,
    last_check     INTEGER,
    provider_url   TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS chain_nodes (
    id             TEXT PRIMARY KEY,
    route_id       TEXT NOT NULL REFERENCES routes(id),
    node_type      TEXT NOT NULL,
    label          TEXT NOT NULL,
    status         TEXT NOT NULL,
    detail         TEXT,
    warning        TEXT,
    provider       TEXT,
    last_check     INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ip_bans (
    ip             TEXT PRIMARY KEY,
    reason         TEXT NOT NULL,
    rule_name      TEXT,
    banned_at      INTEGER NOT NULL,
    expires_at     INTEGER,
    route_id       TEXT REFERENCES routes(id),
    permanent      INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS fail2ban_rules (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    config         TEXT NOT NULL,
    enabled        INTEGER NOT NULL DEFAULT 1,
    hit_count      INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS route_templates (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    description    TEXT,
    config         TEXT NOT NULL,
    built_in       INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS api_keys (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    key_hash       TEXT NOT NULL,
    scopes         TEXT NOT NULL,
    last_used      INTEGER,
    expires_at     INTEGER,
    created_at     INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    email          TEXT NOT NULL UNIQUE,
    password_hash  TEXT,
    role           TEXT NOT NULL DEFAULT 'viewer',
    sso_provider   TEXT,
    sso_subject    TEXT,
    created_at     INTEGER NOT NULL,
    last_login     INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS route_ownership (
    route_id       TEXT PRIMARY KEY REFERENCES routes(id),
    user_id        TEXT NOT NULL REFERENCES users(id),
    assigned_at    INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS pending_changes (
    id             TEXT PRIMARY KEY,
    action         TEXT NOT NULL,
    payload        TEXT NOT NULL,
    requested_by   TEXT NOT NULL REFERENCES users(id),
    requested_at   INTEGER NOT NULL,
    approved_by    TEXT REFERENCES users(id),
    approved_at    INTEGER,
    status         TEXT NOT NULL DEFAULT 'pending'
  )`,
  `CREATE TABLE IF NOT EXISTS route_slos (
    route_id       TEXT PRIMARY KEY REFERENCES routes(id),
    p95_target_ms  INTEGER NOT NULL,
    p99_target_ms  INTEGER,
    window_days    INTEGER NOT NULL DEFAULT 30,
    alert_on_breach INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS slo_compliance (
    route_id       TEXT NOT NULL REFERENCES routes(id),
    date           TEXT NOT NULL,
    p95_actual_ms  INTEGER,
    p99_actual_ms  INTEGER,
    p95_compliant  INTEGER,
    p99_compliant  INTEGER,
    sample_count   INTEGER,
    PRIMARY KEY (route_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS anomaly_baselines (
    route_id       TEXT NOT NULL REFERENCES routes(id),
    metric         TEXT NOT NULL,
    hour_of_week   INTEGER NOT NULL,
    mean           REAL NOT NULL,
    stddev         REAL NOT NULL,
    sample_count   INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    PRIMARY KEY (route_id, metric, hour_of_week)
  )`,
]

const ALTERS = [
  `ALTER TABLE routes ADD COLUMN rate_limit TEXT`,
  `ALTER TABLE routes ADD COLUMN ip_allowlist TEXT`,
  `ALTER TABLE routes ADD COLUMN basic_auth TEXT`,
  `ALTER TABLE routes ADD COLUMN headers TEXT`,
  `ALTER TABLE routes ADD COLUMN agent_id TEXT REFERENCES agents(id)`,
  `ALTER TABLE users ADD COLUMN display_name TEXT`,
  `ALTER TABLE users ADD COLUMN avatar_color TEXT`,
  `ALTER TABLE users ADD COLUMN avatar_url TEXT`,
]

export function ensureSchema(db: Database.Database): void {
  db.transaction(() => {
    for (const stmt of DDL) db.exec(stmt)
    for (const stmt of V2_DDL) db.exec(stmt)
    for (const stmt of V3_DDL) db.exec(stmt)
    db.exec(`CREATE TABLE IF NOT EXISTS route_security (
      route_id TEXT PRIMARY KEY REFERENCES routes(id) ON DELETE CASCADE,
      geoip_config TEXT,
      jwt_config TEXT,
      mtls_config TEXT,
      bot_challenge_config TEXT,
      exit_node_config TEXT,
      secret_header TEXT,
      updated_at INTEGER NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS webhook_delivery_log (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      url TEXT NOT NULL,
      status_code INTEGER,
      response_time_ms INTEGER NOT NULL,
      success INTEGER NOT NULL,
      error TEXT,
      payload_preview TEXT,
      delivered_at INTEGER NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS system_log (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      detail TEXT,
      user_id TEXT,
      created_at INTEGER NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS ct_alerts (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      issuer TEXT NOT NULL,
      not_before TEXT NOT NULL,
      serial_number TEXT NOT NULL,
      detected_at INTEGER NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS multi_domain_certs (
      id TEXT PRIMARY KEY,
      domains TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'auto',
      routes TEXT NOT NULL DEFAULT '[]',
      issuer TEXT,
      expiry INTEGER,
      created_at INTEGER NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS acme_accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'letsencrypt',
      acme_url TEXT NOT NULL,
      certs_count INTEGER NOT NULL DEFAULT 0,
      rate_limit_used INTEGER NOT NULL DEFAULT 0,
      rate_limit_reset_at INTEGER,
      created_at INTEGER NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS compose_watchers (
      id TEXT PRIMARY KEY,
      project_path TEXT NOT NULL,
      agent_id TEXT,
      auto_apply INTEGER NOT NULL DEFAULT 1,
      watch_interval INTEGER NOT NULL DEFAULT 30,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_checked INTEGER,
      last_result TEXT,
      created_at INTEGER NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS lockbox_refs (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      credential_key TEXT NOT NULL,
      vault_id TEXT NOT NULL,
      secret_path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS patchos_versions (
      agent_id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      health TEXT NOT NULL DEFAULT 'ok',
      recorded_at INTEGER NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS billing_subscriptions (
      id TEXT PRIMARY KEY,
      product TEXT NOT NULL,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      ls_subscription_id TEXT NOT NULL UNIQUE,
      ls_customer_id TEXT NOT NULL,
      ls_order_id TEXT NOT NULL,
      ls_variant_id TEXT NOT NULL,
      ls_customer_portal_url TEXT,
      plan TEXT NOT NULL,
      billing_interval TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      licence_type TEXT NOT NULL DEFAULT 'cloud',
      current_period_start INTEGER NOT NULL,
      current_period_end INTEGER NOT NULL,
      trial_ends_at INTEGER,
      cancelled_at INTEGER,
      expires_at INTEGER,
      payment_failed_at INTEGER,
      dunning_step INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS billing_entitlements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product TEXT NOT NULL,
      plan TEXT NOT NULL,
      source TEXT NOT NULL,
      valid_until INTEGER,
      updated_at INTEGER NOT NULL
    )`)
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_entitlements_user_product ON billing_entitlements(user_id, product)`)
    db.exec(`CREATE TABLE IF NOT EXISTS licence_keys (
      id TEXT PRIMARY KEY,
      product TEXT NOT NULL,
      purchaser_email TEXT NOT NULL,
      ls_licence_key TEXT NOT NULL UNIQUE,
      ls_order_id TEXT NOT NULL,
      ls_variant_id TEXT NOT NULL,
      ls_instance_id TEXT,
      plan TEXT NOT NULL,
      billing_interval TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'inactive',
      instance_name TEXT,
      last_validated_at INTEGER,
      validation_failures INTEGER NOT NULL DEFAULT 0,
      grace_period_until INTEGER,
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS billing_events (
      id TEXT PRIMARY KEY,
      product TEXT NOT NULL,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      plan_from TEXT,
      plan_to TEXT,
      amount_usd_cents INTEGER,
      billing_interval TEXT,
      ls_event_id TEXT,
      created_at INTEGER NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS billing_webhook_events (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL UNIQUE,
      event_name TEXT NOT NULL,
      product TEXT,
      payload TEXT NOT NULL,
      processed_at INTEGER NOT NULL,
      error TEXT
    )`)
    // V3.1 tables
    db.exec(`CREATE TABLE IF NOT EXISTS redirect_hosts (
      id              TEXT PRIMARY KEY,
      agent_id        TEXT REFERENCES agents(id),
      source_domain   TEXT NOT NULL UNIQUE,
      destination_url TEXT NOT NULL,
      redirect_code   INTEGER NOT NULL DEFAULT 301,
      preserve_path   INTEGER NOT NULL DEFAULT 1,
      preserve_query  INTEGER NOT NULL DEFAULT 1,
      tls_enabled     INTEGER NOT NULL DEFAULT 1,
      access_list_id  TEXT REFERENCES access_lists(id),
      enabled         INTEGER NOT NULL DEFAULT 1,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS streams (
      id              TEXT PRIMARY KEY,
      agent_id        TEXT REFERENCES agents(id),
      listen_port     INTEGER NOT NULL UNIQUE,
      protocol        TEXT NOT NULL DEFAULT 'tcp',
      upstream_host   TEXT NOT NULL,
      upstream_port   INTEGER NOT NULL,
      enabled         INTEGER NOT NULL DEFAULT 1,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS error_hosts (
      id              TEXT PRIMARY KEY,
      agent_id        TEXT REFERENCES agents(id),
      domain          TEXT NOT NULL UNIQUE,
      status_code     INTEGER NOT NULL DEFAULT 404,
      page_type       TEXT NOT NULL DEFAULT 'default',
      custom_html     TEXT,
      redirect_url    TEXT,
      tls_enabled     INTEGER NOT NULL DEFAULT 1,
      enabled         INTEGER NOT NULL DEFAULT 1,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS access_lists (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      description     TEXT,
      satisfy_mode    TEXT NOT NULL DEFAULT 'any',
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS access_list_ip_rules (
      id              TEXT PRIMARY KEY,
      access_list_id  TEXT NOT NULL REFERENCES access_lists(id) ON DELETE CASCADE,
      type            TEXT NOT NULL,
      value           TEXT NOT NULL,
      comment         TEXT,
      sort_order      INTEGER NOT NULL DEFAULT 0
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS access_list_auth_users (
      id              TEXT PRIMARY KEY,
      access_list_id  TEXT NOT NULL REFERENCES access_lists(id) ON DELETE CASCADE,
      username        TEXT NOT NULL,
      password_hash   TEXT NOT NULL,
      UNIQUE(access_list_id, username)
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS access_list_auth_config (
      access_list_id  TEXT PRIMARY KEY REFERENCES access_lists(id) ON DELETE CASCADE,
      realm           TEXT NOT NULL DEFAULT 'ProxyOS',
      protected_paths TEXT
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS operation_logs (
      id              TEXT PRIMARY KEY,
      type            TEXT NOT NULL,
      subject         TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'in_progress',
      steps           TEXT NOT NULL DEFAULT '[]',
      duration_ms     INTEGER,
      error           TEXT,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS cert_issuance_log (
      id                TEXT PRIMARY KEY,
      domain            TEXT NOT NULL,
      registered_domain TEXT NOT NULL,
      provider          TEXT NOT NULL,
      method            TEXT,
      issued_at         INTEGER NOT NULL,
      expires_at        INTEGER
    )`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_cert_issuance_registered_domain ON cert_issuance_log(registered_domain, issued_at)`)
  })()
  for (const stmt of ALTERS) {
    try { db.exec(stmt) } catch { /* column already exists */ }
  }
  // V3.1 alters — run after table creation
  const V31_ALTERS = [
    `ALTER TABLE routes ADD COLUMN access_list_id TEXT REFERENCES access_lists(id)`,
    `ALTER TABLE users ADD COLUMN totp_secret TEXT`,
    `ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0`,
  ]
  for (const stmt of V31_ALTERS) {
    try { db.exec(stmt) } catch { /* column already exists */ }
  }
  // V3.2 alters — load balancing
  const V32_ALTERS = [
    `ALTER TABLE routes ADD COLUMN lb_policy TEXT NOT NULL DEFAULT 'round_robin'`,
  ]
  for (const stmt of V32_ALTERS) {
    try { db.exec(stmt) } catch { /* column already exists */ }
  }
  // V2 Phase 1 new tables
  db.exec(`CREATE TABLE IF NOT EXISTS drift_events (
    id TEXT PRIMARY KEY,
    detected_at INTEGER NOT NULL,
    type TEXT NOT NULL,
    route_id TEXT,
    diff_json TEXT,
    resolved_at INTEGER,
    resolution TEXT
  )`)
  db.exec(`CREATE TABLE IF NOT EXISTS route_versions (
    id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    config_snapshot_json TEXT NOT NULL,
    changed_by TEXT NOT NULL DEFAULT 'user',
    changed_at INTEGER NOT NULL,
    change_reason TEXT,
    rollback_of TEXT
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_route_versions_route_id ON route_versions(route_id, version_number)`)
  db.exec(`CREATE TABLE IF NOT EXISTS health_checks (
    id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    checked_at INTEGER NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    body_matched INTEGER,
    overall_status TEXT NOT NULL,
    error TEXT
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_health_checks_route_id ON health_checks(route_id, checked_at)`)
  const V2P1_ALTERS = [
    `ALTER TABLE routes ADD COLUMN health_check_status_codes TEXT`,
    `ALTER TABLE routes ADD COLUMN health_check_body_regex TEXT`,
    `ALTER TABLE routes ADD COLUMN health_check_max_response_ms INTEGER`,
    `ALTER TABLE routes ADD COLUMN last_traffic_at INTEGER`,
    `ALTER TABLE routes ADD COLUMN archived_at INTEGER`,
  ]
  for (const stmt of V2P1_ALTERS) {
    try { db.exec(stmt) } catch { /* column already exists */ }
  }

  // V2 Phase 2 new tables
  db.exec(`CREATE TABLE IF NOT EXISTS route_tags (
    id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    UNIQUE(route_id, tag)
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_route_tags_route_id ON route_tags(route_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_route_tags_tag ON route_tags(tag)`)

  db.exec(`CREATE TABLE IF NOT EXISTS discovery_providers (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    config TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_sync_at INTEGER,
    sync_interval_s INTEGER NOT NULL DEFAULT 60,
    created_at INTEGER NOT NULL
  )`)

  db.exec(`CREATE TABLE IF NOT EXISTS discovered_routes (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES discovery_providers(id) ON DELETE CASCADE,
    source_ref TEXT NOT NULL,
    domain TEXT NOT NULL,
    upstream_url TEXT NOT NULL,
    template_id TEXT,
    promoted_route_id TEXT REFERENCES routes(id) ON DELETE SET NULL,
    last_seen_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(provider_id, source_ref)
  )`)

  db.exec(`CREATE TABLE IF NOT EXISTS ddns_records (
    id TEXT PRIMARY KEY,
    dns_provider_id TEXT NOT NULL,
    zone TEXT NOT NULL,
    record_name TEXT NOT NULL,
    record_type TEXT NOT NULL DEFAULT 'A',
    last_ip TEXT,
    last_updated_at INTEGER,
    update_interval_s INTEGER NOT NULL DEFAULT 300,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_error TEXT,
    created_at INTEGER NOT NULL
  )`)

  db.exec(`CREATE TABLE IF NOT EXISTS tunnel_providers (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    credentials TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'disconnected',
    last_tested_at INTEGER,
    created_at INTEGER NOT NULL
  )`)

  db.exec(`CREATE TABLE IF NOT EXISTS waf_events (
    id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    rule_id TEXT,
    action TEXT NOT NULL,
    client_ip TEXT,
    path TEXT,
    message TEXT,
    detected_at INTEGER NOT NULL
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_waf_events_route_id ON waf_events(route_id, detected_at)`)

  db.exec(`CREATE TABLE IF NOT EXISTS oauth_providers (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    oidc_discovery_url TEXT,
    allowed_domains TEXT,
    allowed_users TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )`)

  const V2P2_ALTERS = [
    `ALTER TABLE routes ADD COLUMN waf_mode TEXT NOT NULL DEFAULT 'off'`,
    `ALTER TABLE routes ADD COLUMN waf_exclusions TEXT`,
    `ALTER TABLE routes ADD COLUMN rate_limit_key TEXT`,
    `ALTER TABLE routes ADD COLUMN tunnel_provider_id TEXT REFERENCES tunnel_providers(id)`,
    `ALTER TABLE routes ADD COLUMN oauth_proxy_provider_id TEXT REFERENCES oauth_providers(id)`,
    `ALTER TABLE routes ADD COLUMN oauth_proxy_allowlist TEXT`,
  ]
  for (const stmt of V2P2_ALTERS) {
    try { db.exec(stmt) } catch { /* column already exists */ }
  }

  // Phase 3 new tables
  db.exec(`CREATE TABLE IF NOT EXISTS secrets_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    config TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_tested_at INTEGER,
    test_status TEXT NOT NULL DEFAULT 'unknown',
    created_at INTEGER NOT NULL
  )`)

  db.exec(`CREATE TABLE IF NOT EXISTS scheduled_changes (
    id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    payload TEXT,
    scheduled_at INTEGER NOT NULL,
    executed_at INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    created_at INTEGER NOT NULL
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scheduled_changes_route_id ON scheduled_changes(route_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scheduled_changes_scheduled_at ON scheduled_changes(scheduled_at, status)`)

  db.exec(`CREATE TABLE IF NOT EXISTS traffic_replay_logs (
    id TEXT PRIMARY KEY,
    route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    query TEXT,
    headers TEXT,
    body TEXT,
    status_code INTEGER,
    response_time_ms INTEGER,
    recorded_at INTEGER NOT NULL
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_traffic_replay_logs_route_id ON traffic_replay_logs(route_id, recorded_at)`)

  db.exec(`CREATE TABLE IF NOT EXISTS route_health_scores (
    route_id TEXT PRIMARY KEY REFERENCES routes(id) ON DELETE CASCADE,
    score INTEGER NOT NULL DEFAULT 100,
    uptime_pct INTEGER NOT NULL DEFAULT 100,
    p95_ms INTEGER,
    error_rate_pct INTEGER NOT NULL DEFAULT 0,
    slo_compliant INTEGER NOT NULL DEFAULT 1,
    calculated_at INTEGER NOT NULL
  )`)

  // Phase 3 route column additions
  const V3P3_ALTERS = [
    `ALTER TABLE routes ADD COLUMN staging_upstreams TEXT`,
    `ALTER TABLE routes ADD COLUMN traffic_split_pct INTEGER`,
    `ALTER TABLE routes ADD COLUMN mirror_upstream TEXT`,
    `ALTER TABLE routes ADD COLUMN mirror_sample_rate INTEGER`,
  ]
  for (const stmt of V3P3_ALTERS) {
    try { db.exec(stmt) } catch { /* column already exists */ }
  }
}
