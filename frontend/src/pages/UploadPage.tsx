import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Info, Sparkles, Upload } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { StartMode, UploadResult } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { PageHeader } from '../components/PageHeader';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Spinner } from '../components/Spinner';
import { formatTokens } from '../lib/format';

interface FormState {
  api_key: string;
  base_url: string;
  total_tokens: string;
  valid_days: string;
  price: string;
  start_mode: StartMode;
  package_name: string;
  description: string;
}

const INITIAL: FormState = {
  api_key: '',
  base_url: '',
  total_tokens: '',
  valid_days: '30',
  price: '',
  start_mode: 'on_purchase',
  package_name: '',
  description: '',
};

export function UploadPage() {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!form.api_key.trim() || !form.base_url.trim() || !form.total_tokens.trim() || !form.price.trim()) {
      setError('API key, base URL, token amount, and price are required.');
      return;
    }

    setBusy(true);
    try {
      const payload = {
        api_key: form.api_key.trim(),
        base_url: form.base_url.trim(),
        total_tokens: form.total_tokens.trim(),
        valid_days: Number(form.valid_days),
        price: Number(form.price),
        start_mode: form.start_mode,
        package_name: form.package_name.trim() || undefined,
        description: form.description.trim() || undefined,
      };
      const res = await api.post<UploadResult>('/api/stock/upload', payload);
      setResult(res);
      toast.success(
        res.package.created
          ? `Uploaded — new package "${res.package.name}" created`
          : `Uploaded to "${res.package.name}"`,
      );
      // Reset the sensitive field + amount; keep pricing defaults for bulk entry.
      setForm((f) => ({ ...f, api_key: '', package_name: '', description: '' }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="API Upload Center"
        description="Add an API key to stock. The matching package is created automatically from the token amount."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="Upload API key" subtitle="Encrypted at rest — never stored or logged in plaintext." />
            <CardBody>
              <form onSubmit={submit} className="space-y-5">
                <div>
                  <label className="label">API Key</label>
                  <textarea
                    className="input min-h-[80px] font-mono"
                    placeholder="sk-..."
                    value={form.api_key}
                    onChange={(e) => set('api_key', e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>

                <div>
                  <label className="label">Base URL</label>
                  <input
                    className="input"
                    placeholder="https://api.provider.com/v1"
                    value={form.base_url}
                    onChange={(e) => set('base_url', e.target.value)}
                    spellCheck={false}
                  />
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label className="label">Token Amount</label>
                    <input
                      className="input"
                      placeholder="2B, 750M, 5000000000…"
                      value={form.total_tokens}
                      onChange={(e) => set('total_tokens', e.target.value)}
                    />
                    <p className="mt-1 text-xs text-gray-500">Accepts 2B, 750M, 1.5B, or a raw number.</p>
                  </div>
                  <div>
                    <label className="label">Price (USD)</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="19.99"
                      value={form.price}
                      onChange={(e) => set('price', e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label className="label">Valid Days</label>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      value={form.valid_days}
                      onChange={(e) => set('valid_days', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Start Mode</label>
                    <select
                      className="input"
                      value={form.start_mode}
                      onChange={(e) => set('start_mode', e.target.value as StartMode)}
                    >
                      <option value="on_purchase">On purchase (recommended)</option>
                      <option value="immediate">Immediate (clock starts now)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="label">
                    Package Name <span className="text-gray-600">(optional)</span>
                  </label>
                  <input
                    className="input"
                    placeholder="Auto-named from token amount if blank"
                    value={form.package_name}
                    onChange={(e) => set('package_name', e.target.value)}
                  />
                </div>

                <div>
                  <label className="label">
                    Description <span className="text-gray-600">(optional)</span>
                  </label>
                  <textarea
                    className="input min-h-[60px]"
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                  />
                </div>

                {error && (
                  <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3">
                  <button type="button" className="btn-ghost" onClick={() => setForm(INITIAL)} disabled={busy}>
                    Reset
                  </button>
                  <button type="submit" className="btn-primary" disabled={busy}>
                    {busy ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                    Upload to stock
                  </button>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          {/* Auto-package explainer */}
          <Card>
            <CardBody>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand-400 ring-1 ring-inset ring-brand/20">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-100">Automatic packages</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Uploading finds or creates the package matching the token amount. New sizes need no
                    code changes or redeploy — they appear in the store instantly.
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Result */}
          {result && (
            <Card className="border-ok/30">
              <CardBody>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-100">Upload successful</p>
                    <dl className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500">Package</dt>
                        <dd className="text-gray-200">{result.package.name}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500">Tokens</dt>
                        <dd className="text-gray-200">{formatTokens(result.package.total_tokens)}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500">Package status</dt>
                        <dd className={result.package.created ? 'text-brand-400' : 'text-gray-400'}>
                          {result.package.created ? 'Newly created' : 'Existing'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500">Key</dt>
                        <dd className="font-mono text-gray-200">{result.token.masked_key}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500">Available stock</dt>
                        <dd className="text-gray-200">{result.stock_available}</dd>
                      </div>
                    </dl>
                    <div className="mt-4 flex gap-2">
                      <Link to="/stock" className="btn-ghost text-xs">
                        View stock
                      </Link>
                      <Link to="/packages" className="btn-ghost text-xs">
                        View packages
                      </Link>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardBody>
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 shrink-0 text-gray-500" />
                <p className="text-sm text-gray-500">
                  Duplicate keys are rejected automatically via a secure fingerprint — the same key can
                  never be added twice.
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
