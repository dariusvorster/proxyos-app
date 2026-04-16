'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Input, StepIndicator } from '~/components/ui'
import { Topbar, PageContent } from '~/components/shell'
import { trpc } from '~/lib/trpc'

const STEPS = ['Details', 'Deploy', 'Confirm']

export default function NewAgentPage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const registerMutation = trpc.agents.register.useMutation({
    onSuccess: () => utils.agents.list.invalidate(),
  })

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [siteTag, setSiteTag] = useState('')
  const [description, setDescription] = useState('')
  const [result, setResult] = useState<{ id: string; token: string; expiresAt: number } | null>(null)

  async function onRegister(e: FormEvent) {
    e.preventDefault()
    const res = await registerMutation.mutateAsync({
      name,
      siteTag: siteTag || undefined,
      description: description || undefined,
    })
    setResult(res)
    setStep(1)
  }

  const installSnippet = result
    ? `docker run -d \\
  --name proxyos-agent \\
  --network host \\
  -e CENTRAL_URL=https://your-proxyos-host.com \\
  -e AGENT_TOKEN=${result.token} \\
  -e AGENT_ID=${result.id} \\
  ghcr.io/proxyos/agent:latest`
    : ''

  return (
    <>
      <Topbar title="Register Agent" />
      <PageContent>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}><StepIndicator steps={STEPS} active={step} /></div>

        {step === 0 && (
          <Card header={<span>Agent details</span>}>
            <form onSubmit={onRegister} style={{ display: 'grid', gap: 14 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Agent name *</span>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="homelab-primary" required />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Site tag</span>
                <Input value={siteTag} onChange={e => setSiteTag(e.target.value)} placeholder="homelab" />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Description</span>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Primary homelab node, LAN 192.168.69.x" />
              </label>
              {registerMutation.isError && (
                <div style={{ padding: '8px 12px', borderRadius: 6, background: 'color-mix(in srgb, var(--red) 10%, transparent)', color: 'var(--red)', fontSize: 11 }}>
                  {registerMutation.error.message}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={!name || registerMutation.isPending}>
                  {registerMutation.isPending ? 'Registering…' : 'Register & generate token'}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {step === 1 && result && (
          <Card header={<span>Deploy agent</span>}>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Run this command on your target host. The token is shown only once — copy it now.
            </p>
            <div style={{
              background: 'var(--surface-2)', borderRadius: 6, padding: '12px 14px',
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)',
              whiteSpace: 'pre', overflowX: 'auto', lineHeight: 1.7,
              border: '1px solid var(--border)',
            }}>
              {installSnippet}
            </div>
            <div style={{ marginTop: 12, padding: '10px 12px', background: 'color-mix(in srgb, var(--amber) 10%, transparent)', borderRadius: 6, fontSize: 11, color: 'var(--amber)' }}>
              Token expires: {new Date(result.expiresAt).toLocaleDateString()} — generate a new token before expiry from the agent detail page.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <Button variant="ghost" onClick={() => setStep(0)}>← Back</Button>
              <Button variant="primary" onClick={() => setStep(2)}>I&apos;ve deployed the agent →</Button>
            </div>
          </Card>
        )}

        {step === 2 && result && (
          <Card header={<span>Confirm</span>}>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Once the agent connects, it will appear as online in the fleet table. This usually takes under 30 seconds.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" onClick={() => router.push('/agents')}>Go to Agents →</Button>
              <Button variant="ghost" onClick={() => router.push(`/agents/${result.id}`)}>View agent detail</Button>
            </div>
          </Card>
        )}
        </div>
      </PageContent>
    </>
  )
}
