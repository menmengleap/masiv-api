import { useCallback, useEffect, useState } from 'react';
import { Save, Bot, FileText, Wallet } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { BotSettings, ServicePolicies } from '../lib/types';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { PageHeader } from '../components/PageHeader';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Spinner, LoadingState } from '../components/Spinner';
import { ErrorState } from '../components/States';

export function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Bot behaviour, payment details, and legal copy — all stored in the database and applied without a redeploy."
      />
      <div className="space-y-6">
        <BotSettingsForm />
        <PoliciesForm />
      </div>
    </div>
  );
}

/* ------------------------------- Bot settings ------------------------------ */

type SettingsForm = {
  bot_name: string;
  usd_to_usdt: string;
  payment_currency: string;
  payment_wallet: string;
  payment_network: string;
  payment_timeout_minutes: string;
  welcome_message: string;
  support_username: string;
  documentation_url: string;
};

function toForm(s: BotSettings): SettingsForm {
  return {
    bot_name: s.bot_name ?? '',
    usd_to_usdt: s.usd_to_usdt ?? '',
    payment_currency: s.payment_currency ?? '',
    payment_wallet: s.payment_wallet ?? '',
    payment_network: s.payment_network ?? '',
    payment_timeout_minutes: String(s.payment_timeout_minutes ?? ''),
    welcome_message: s.welcome_message ?? '',
    support_username: s.support_username ?? '',
    documentation_url: s.documentation_url ?? '',
  };
}

function BotSettingsForm() {
  const toast = useToast();
  const fetchSettings = useCallback((s: AbortSignal) => api.get<BotSettings>('/api/settings', undefined, s), []);
  const settings = useApi(fetchSettings, []);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.data) setForm(toForm(settings.data));
  }, [settings.data]);

  const set = (k: keyof SettingsForm, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      // Numeric fields are coerced server-side; send strings null-safe.
      const payload = {
        bot_name: form.bot_name.trim(),
        usd_to_usdt: form.usd_to_usdt,
        payment_currency: form.payment_currency.trim(),
        payment_wallet: form.payment_wallet.trim() || null,
        payment_network: form.payment_network.trim() || null,
        payment_timeout_minutes: form.payment_timeout_minutes,
        welcome_message: form.welcome_message.trim() || null,
        support_username: form.support_username.trim() || null,
        documentation_url: form.documentation_url.trim() || null,
      };
      const updated = await api.put<BotSettings>('/api/settings', payload);
      setForm(toForm(updated));
      settings.setData(updated);
      toast.success('Bot settings saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (settings.initialLoading) return <Card><LoadingState /></Card>;
  if (settings.error && !settings.data) return <Card><ErrorState message={settings.error} onRetry={settings.refetch} /></Card>;
  if (!form) return null;

  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><Bot className="h-5 w-5 text-brand-400" /> Bot configuration</span>}
        subtitle="Shown to customers in the Telegram store."
      />
      <CardBody className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Bot display name">
            <input className="input" value={form.bot_name} onChange={(e) => set('bot_name', e.target.value)} />
          </Field>
          <Field label="Support username" hint="Telegram @handle customers can contact.">
            <input className="input" value={form.support_username} placeholder="@support" onChange={(e) => set('support_username', e.target.value)} />
          </Field>
          <Field label="USD → USDT rate" hint="Conversion applied to package USD prices.">
            <input className="input font-mono" inputMode="decimal" value={form.usd_to_usdt} onChange={(e) => set('usd_to_usdt', e.target.value)} />
          </Field>
          <Field label="Documentation URL">
            <input className="input" value={form.documentation_url} placeholder="https://…" onChange={(e) => set('documentation_url', e.target.value)} />
          </Field>
        </div>

        <div className="border-t border-ink-750 pt-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-300">
            <Wallet className="h-4 w-4 text-brand-400" /> Payment
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Payment currency">
              <input className="input" value={form.payment_currency} placeholder="USDT" onChange={(e) => set('payment_currency', e.target.value)} />
            </Field>
            <Field label="Network" hint="e.g. TRC20, ERC20, BEP20.">
              <input className="input" value={form.payment_network} placeholder="TRC20" onChange={(e) => set('payment_network', e.target.value)} />
            </Field>
            <Field label="Receiving wallet address" hint="Customers send USDT here. Displayed by the bot at checkout.">
              <input className="input font-mono" value={form.payment_wallet} placeholder="T…" spellCheck={false} onChange={(e) => set('payment_wallet', e.target.value)} />
            </Field>
            <Field label="Payment timeout (minutes)" hint="Unpaid orders auto-expire and release stock.">
              <input className="input" inputMode="numeric" value={form.payment_timeout_minutes} onChange={(e) => set('payment_timeout_minutes', e.target.value)} />
            </Field>
          </div>
        </div>

        <Field label="Welcome message" hint="Sent on /start. Supports plain text.">
          <textarea
            className="input min-h-[96px] resize-y"
            value={form.welcome_message}
            onChange={(e) => set('welcome_message', e.target.value)}
          />
        </Field>

        <div className="flex justify-end">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            Save settings
          </button>
        </div>
      </CardBody>
    </Card>
  );
}

/* --------------------------------- Policies -------------------------------- */

type PolicyForm = { terms_of_service: string; privacy_policy: string; service_policy: string };

function PoliciesForm() {
  const toast = useToast();
  const fetchPolicies = useCallback((s: AbortSignal) => api.get<ServicePolicies>('/api/policies', undefined, s), []);
  const policies = useApi(fetchPolicies, []);
  const [form, setForm] = useState<PolicyForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (policies.data) {
      setForm({
        terms_of_service: policies.data.terms_of_service ?? '',
        privacy_policy: policies.data.privacy_policy ?? '',
        service_policy: policies.data.service_policy ?? '',
      });
    }
  }, [policies.data]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const updated = await api.put<ServicePolicies>('/api/policies', form);
      policies.setData(updated);
      toast.success('Policies saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (policies.initialLoading) return <Card><LoadingState /></Card>;
  if (policies.error && !policies.data) return <Card><ErrorState message={policies.error} onRetry={policies.refetch} /></Card>;
  if (!form) return null;

  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><FileText className="h-5 w-5 text-brand-400" /> Service policies</span>}
        subtitle="Legal copy the bot can surface to customers on request."
      />
      <CardBody className="space-y-5">
        <PolicyField label="Terms of Service" value={form.terms_of_service} onChange={(v) => setForm((f) => (f ? { ...f, terms_of_service: v } : f))} />
        <PolicyField label="Privacy Policy" value={form.privacy_policy} onChange={(v) => setForm((f) => (f ? { ...f, privacy_policy: v } : f))} />
        <PolicyField label="Service Policy" value={form.service_policy} onChange={(v) => setForm((f) => (f ? { ...f, service_policy: v } : f))} />
        <div className="flex justify-end">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            Save policies
          </button>
        </div>
      </CardBody>
    </Card>
  );
}

function PolicyField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <textarea className="input min-h-[120px] resize-y font-sans" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
