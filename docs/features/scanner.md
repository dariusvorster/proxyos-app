# Scanner

> The container scanner discovers running Docker containers and suggests routes for them.

## What it does

ProxyOS scans the Docker socket for running containers, inspects their exposed ports and labels, and suggests route configurations. Discovered containers are stored in the `scanned_containers` table.

For each container, the scanner attempts to determine:
- The container name and image
- The most likely HTTP/HTTPS port to expose
- A suggested domain name (based on container name or labels)
- A confidence level for the suggestion (`high`, `medium`, `low`)

When a suggestion looks good, you can promote it to a real route with one click.

## When to use it

Use the scanner when:
- You have many existing Docker containers and want to quickly create routes for them
- You add new containers and want ProxyOS to detect them automatically
- You want to audit which containers are exposed and which are not

## How to configure

Go to **Containers** in the sidebar. ProxyOS shows all discovered containers with their suggested routes.

**Labels for better detection**: Add Docker labels to your containers to help the scanner generate accurate suggestions:

```yaml
labels:
  proxyos.domain: "myapp.yourdomain.com"
  proxyos.port: "3000"
  proxyos.scheme: "http"
```

When these labels are present, the scanner uses them directly (high confidence). Without labels, the scanner infers based on common port conventions (medium/low confidence).

**Import sessions**: When you promote multiple containers at once, ProxyOS creates an import session (`import_sessions` table) that tracks how many routes were imported, skipped, or failed.

## Troubleshooting

- **Containers not appearing**: Verify the Docker socket is mounted: check `docker-compose.yml` has `/var/run/docker.sock:/var/run/docker.sock:ro`
- **Wrong port suggested**: Add `proxyos.port` label to the container to override the auto-detected port
- **Promoted route not working**: After promotion, verify the upstream address and test connectivity with a health check
