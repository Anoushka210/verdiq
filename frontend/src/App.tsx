/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Activity,
  UploadCloud,
  FileJson,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Layers,
  Search,
  Database,
  ArrowRight,
  Info,
  Clock,
  MapPin,
  Cpu,
  FileText,
  Settings,
  HelpCircle
} from 'lucide-react';

// Types representing backend models
export interface AnomalyItem {
  timestamp?: string;
  time?: string;
  value?: number;
  unit?: string;
  z_score?: number;
  zScore?: number;
  z?: number;
  iqr_bounds?: [number, number] | { lower?: number; upper?: number } | string;
  iqrBounds?: [number, number] | { lower?: number; upper?: number } | string;
  rolling_mean?: number;
  rollingMean?: number;
  mean?: number;
  explanation?: string;
  reason?: string;
  details?: string;
}

export interface BatchAnalysis {
  batch_id?: string;
  id?: string;
  location?: string;
  parameter?: string;
  total_readings?: number;
  readings_count?: number;
  anomaly_count?: number;
  anomalies_count?: number;
  data_hash?: string;
  hash?: string;
  sha256?: string;
  tx_hash?: string;
  transaction_hash?: string;
  ledger_timestamp?: string | number;
  timestamp?: string | number;
  created_at?: string | number;
  anomalies?: AnomalyItem[];
  status?: string;
}

export interface VerifyResult {
  verified: boolean;
  registered_hash?: string;
  submitted_hash?: string;
  tx_hash?: string;
  batch_id?: string;
  message?: string;
}

// Built-in sample datasets for immediate testing
const SAMPLE_NITRATE_BATCH = {
  batch_id: "BATCH-2026-WN-049",
  location: "Willamette River Station 4B, Oregon",
  parameter: "Nitrate Concentration (NO3-N)",
  unit: "mg/L",
  sensor_id: "WT-ISCO-882",
  timestamp: "2026-10-24T12:00:00Z",
  readings: [
    { timestamp: "2026-10-24T00:00:00Z", value: 11.2 },
    { timestamp: "2026-10-24T01:00:00Z", value: 11.8 },
    { timestamp: "2026-10-24T02:00:00Z", value: 12.1 },
    { timestamp: "2026-10-24T03:00:00Z", value: 11.5 },
    { timestamp: "2026-10-24T04:00:00Z", value: 12.3 },
    { timestamp: "2026-10-24T05:00:00Z", value: 84.7 }, // Outlier anomaly
    { timestamp: "2026-10-24T06:00:00Z", value: 12.0 },
    { timestamp: "2026-10-24T07:00:00Z", value: 11.9 },
    { timestamp: "2026-10-24T08:00:00Z", value: 12.4 },
    { timestamp: "2026-10-24T09:00:00Z", value: 12.2 }
  ]
};

const SAMPLE_CLEAN_PM25_BATCH = {
  batch_id: "BATCH-2026-OP-112",
  location: "Olympic National Forest Station 01",
  parameter: "Particulate Matter PM2.5",
  unit: "µg/m³",
  sensor_id: "AQ-BAM-1020",
  timestamp: "2026-10-25T08:00:00Z",
  readings: [
    { timestamp: "2026-10-25T00:00:00Z", value: 4.2 },
    { timestamp: "2026-10-25T01:00:00Z", value: 4.5 },
    { timestamp: "2026-10-25T02:00:00Z", value: 4.1 },
    { timestamp: "2026-10-25T03:00:00Z", value: 4.8 },
    { timestamp: "2026-10-25T04:00:00Z", value: 4.4 },
    { timestamp: "2026-10-25T05:00:00Z", value: 4.6 },
    { timestamp: "2026-10-25T06:00:00Z", value: 4.3 },
    { timestamp: "2026-10-25T07:00:00Z", value: 4.7 }
  ]
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'verify' | 'about'>('dashboard');
  const [apiUrl, setApiUrl] = useState<string>(() => {
    return localStorage.getItem('verdiq_api_url') || 'http://localhost:8000';
  });
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Health state
  const [healthStatus, setHealthStatus] = useState<'checking' | 'healthy' | 'unreachable'>('checking');
  const [lastHealthCheck, setLastHealthCheck] = useState<Date | null>(null);

  // Batches state
  const [batches, setBatches] = useState<BatchAnalysis[]>(() => {
    try {
      const saved = localStorage.getItem('verdiq_cached_batches');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Current selected / viewed analysis
  const [currentAnalysis, setCurrentAnalysis] = useState<BatchAnalysis | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState<boolean>(false);

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Anomaly row expansion in analysis view
  const [expandedAnomalies, setExpandedAnomalies] = useState<Record<number, boolean>>({});

  // Verify state
  const [verifyBatchId, setVerifyBatchId] = useState<string>('');
  const [verifyFile, setVerifyFile] = useState<File | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Clipboard copy state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Save batches to local storage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('verdiq_cached_batches', JSON.stringify(batches));
    } catch (e) {
      console.warn('Could not save batches to localStorage', e);
    }
  }, [batches]);

  // Check health on load and when API URL changes
  const checkHealth = async (customUrl?: string) => {
    const url = customUrl || apiUrl;
    setHealthStatus('checking');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${url}/api/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' || data.status === 'healthy' || data.status === 'OK') {
          setHealthStatus('healthy');
        } else {
          setHealthStatus('healthy'); // If it responded 200, it's alive
        }
      } else {
        setHealthStatus('unreachable');
      }
    } catch {
      setHealthStatus('unreachable');
    } finally {
      setLastHealthCheck(new Date());
    }
  };

  useEffect(() => {
    checkHealth();
  }, [apiUrl]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Helper formatters
  const truncateTxHash = (hash?: string): string => {
    if (!hash) return '—';
    if (hash.length <= 14) return hash;
    return `${hash.slice(0, 10)}...${hash.slice(-4)}`;
  };

  const formatLedgerTimestamp = (ts?: string | number): string => {
    if (!ts) return '—';
    try {
      let date: Date;
      if (typeof ts === 'number') {
        date = new Date(ts > 1e11 ? ts : ts * 1000);
      } else {
        date = new Date(ts);
      }
      if (isNaN(date.getTime())) return String(ts);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
      }).format(date);
    } catch {
      return String(ts);
    }
  };

  const formatNumber = (num?: number, decimals = 2): string => {
    if (num === undefined || num === null) return '—';
    return Number(num).toFixed(decimals);
  };

  const formatIqrBounds = (val?: [number, number] | { lower?: number; upper?: number } | string): string => {
    if (!val) return '—';
    if (Array.isArray(val)) {
      return `[${val.map(v => typeof v === 'number' ? v.toFixed(2) : String(v)).join(', ')}]`;
    }
    if (typeof val === 'object') {
      const lower = val.lower ?? (val as any).min;
      const upper = val.upper ?? (val as any).max;
      if (lower !== undefined && upper !== undefined) {
        return `[${Number(lower).toFixed(2)}, ${Number(upper).toFixed(2)}]`;
      }
      return JSON.stringify(val);
    }
    return String(val);
  };

  // Safe normalizers for batch data
  const getBatchId = (b?: BatchAnalysis | null) => b?.batch_id || b?.id || '—';
  const getLocation = (b?: BatchAnalysis | null) => b?.location || 'Unknown Location';
  const getParameter = (b?: BatchAnalysis | null) => b?.parameter || 'Environmental Parameter';
  const getTotalReadings = (b?: BatchAnalysis | null) => b?.total_readings ?? b?.readings_count ?? 0;
  const getAnomalyCount = (b?: BatchAnalysis | null) => b?.anomaly_count ?? b?.anomalies_count ?? (b?.anomalies ? b.anomalies.length : 0);
  const getDataHash = (b?: BatchAnalysis | null) => b?.data_hash || b?.hash || b?.sha256 || '—';
  const getTxHash = (b?: BatchAnalysis | null) => b?.tx_hash || b?.transaction_hash || '—';
  const getLedgerTime = (b?: BatchAnalysis | null) => b?.ledger_timestamp || b?.timestamp || b?.created_at;
  const getAnomaliesList = (b?: BatchAnalysis | null): AnomalyItem[] => b?.anomalies || [];

  // Summary stats
  const totalBatchesCount = batches.length;
  const totalAnomaliesCount = batches.reduce((sum, b) => sum + getAnomalyCount(b), 0);
  const totalReadingsCount = batches.reduce((sum, b) => sum + getTotalReadings(b), 0);

  // Load a batch analysis by ID (GET /api/batches/{id})
  const fetchBatchById = async (id: string) => {
    setIsLoadingAnalysis(true);
    setUploadError(null);
    try {
      const res = await fetch(`${apiUrl}/api/batches/${encodeURIComponent(id)}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch batch ${id}: ${res.statusText} (${res.status})`);
      }
      const data: BatchAnalysis = await res.json();
      setCurrentAnalysis(data);
      // Update in cached list if exists or prepend
      setBatches(prev => {
        const existingIndex = prev.findIndex(b => getBatchId(b) === id);
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = { ...next[existingIndex], ...data };
          return next;
        }
        return [data, ...prev];
      });
      setActiveTab('upload');
    } catch (err: any) {
      // If backend is offline but batch is in state, show local copy
      const local = batches.find(b => getBatchId(b) === id);
      if (local) {
        setCurrentAnalysis(local);
        setActiveTab('upload');
      } else {
        alert(err.message || 'Unable to retrieve batch analysis');
      }
    } finally {
      setIsLoadingAnalysis(false);
    }
  };

  // Upload file to POST /api/batches
  const handleUploadSubmit = async (fileToUpload?: File) => {
    const targetFile = fileToUpload || uploadFile;
    if (!targetFile) {
      setUploadError('Please select or drop a JSON file to upload.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', targetFile);

    try {
      const res = await fetch(`${apiUrl}/api/batches`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        let errMessage = `Upload failed with HTTP ${res.status}`;
        try {
          const errData = await res.json();
          errMessage = errData.detail || errData.message || errData.error || errMessage;
        } catch {
          // Response body was not JSON
        }
        throw new Error(errMessage);
      }

      const analysisData: BatchAnalysis = await res.json();
      setCurrentAnalysis(analysisData);

      // Add to batches list
      setBatches(prev => {
        const id = getBatchId(analysisData);
        const filtered = prev.filter(b => getBatchId(b) !== id);
        return [analysisData, ...filtered];
      });

      // Reset file selection
      setUploadFile(null);
      setExpandedAnomalies({});
    } catch (err: any) {
      console.error('Batch upload error:', err);
      setUploadError(
        err.message || 'Error uploading batch to backend. Please ensure http://localhost:8000 is running.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  // Load a built-in sample JSON into file upload
  const loadSampleFile = (sampleObj: any, filename: string) => {
    const jsonStr = JSON.stringify(sampleObj, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const file = new File([blob], filename, { type: 'application/json' });
    setUploadFile(file);
    setUploadError(null);
  };

  // Download sample file helper
  const downloadSampleJson = (sampleObj: any, filename: string) => {
    const jsonStr = JSON.stringify(sampleObj, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Verify file against POST /api/batches/{id}/verify
  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyBatchId.trim()) {
      setVerifyError('Please enter or select a Batch ID to verify.');
      return;
    }
    if (!verifyFile) {
      setVerifyError('Please select the JSON file to verify against the ledger.');
      return;
    }

    setIsVerifying(true);
    setVerifyError(null);
    setVerifyResult(null);

    const formData = new FormData();
    formData.append('file', verifyFile);

    try {
      const res = await fetch(`${apiUrl}/api/batches/${encodeURIComponent(verifyBatchId.trim())}/verify`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        let errMessage = `Verification request failed with status ${res.status}`;
        try {
          const errData = await res.json();
          errMessage = errData.detail || errData.message || errData.error || errMessage;
        } catch {
          // not json
        }
        throw new Error(errMessage);
      }

      const result: VerifyResult = await res.json();
      setVerifyResult({
        ...result,
        batch_id: verifyBatchId.trim()
      });
    } catch (err: any) {
      console.error('Verify error:', err);
      setVerifyError(
        err.message || 'Verification failed. Verify backend is running and batch ID exists.'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  // Pre-fill verify tab from a batch
  const openVerifyForBatch = (b: BatchAnalysis) => {
    const id = getBatchId(b);
    setVerifyBatchId(id);
    setVerifyResult(null);
    setVerifyError(null);
    setActiveTab('verify');
  };

  // Toggle anomaly row
  const toggleAnomalyRow = (index: number) => {
    setExpandedAnomalies(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* TOP BAR / NAVIGATION */}
      <header className="sticky top-0 z-40 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto h-16 flex items-center justify-between gap-6">
          {/* Brand Zone */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-white">Verdiq</span>
                <span className="hidden sm:inline-block text-[11px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-500/20 px-2 py-0.5 rounded">
                  v1.0 AMOY
                </span>
              </div>
              <p className="text-xs text-slate-400 -mt-0.5 hidden md:block">
                Environmental Data Integrity Platform
              </p>
            </div>
          </div>

          {/* Navigation Links / Tabs */}
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'dashboard'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'upload'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              Upload & Analyze
            </button>
            <button
              onClick={() => setActiveTab('verify')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'verify'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              Verify Integrity
            </button>
            <button
              onClick={() => setActiveTab('about')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'about'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              About
            </button>
          </nav>

          {/* Health Status & Controls */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Backend connection pill */}
            <div
              className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-mono border transition-all ${
                healthStatus === 'healthy'
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
                  : healthStatus === 'checking'
                  ? 'bg-amber-950/40 border-amber-500/30 text-amber-300'
                  : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              }`}
              title={`Backend at ${apiUrl}`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  healthStatus === 'healthy'
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                    : healthStatus === 'checking'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]'
                }`}
              />
              <span className="hidden lg:inline">
                {healthStatus === 'healthy'
                  ? 'Backend Online'
                  : healthStatus === 'checking'
                  ? 'Pinging API...'
                  : 'Backend Offline'}
              </span>
              <button
                onClick={() => checkHealth()}
                disabled={healthStatus === 'checking'}
                aria-label="Refresh health check"
                className="text-slate-400 hover:text-white transition-colors"
              >
                <RefreshCw
                  className={`w-3 h-3 ${healthStatus === 'checking' ? 'animate-spin' : ''}`}
                />
              </button>
            </div>

            {/* API settings button */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-md border border-slate-800 transition-colors"
              title="API Endpoint Configuration"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* API Settings Dropdown drawer */}
        {showSettings && (
          <div className="max-w-7xl mx-auto py-3 px-4 mb-3 bg-slate-900/90 border border-slate-800 rounded-lg flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Backend Endpoint:</span>
              <input
                type="text"
                value={apiUrl}
                onChange={e => {
                  setApiUrl(e.target.value);
                  localStorage.setItem('verdiq_api_url', e.target.value);
                }}
                className="px-2.5 py-1 bg-slate-950 border border-slate-700 rounded font-mono text-slate-200 w-64 focus:outline-none focus:border-emerald-500"
                placeholder="http://localhost:8000"
              />
              <button
                onClick={() => checkHealth()}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium transition-colors"
              >
                Test Connection
              </button>
              <button
                onClick={() => {
                  setApiUrl('http://localhost:8000');
                  localStorage.setItem('verdiq_api_url', 'http://localhost:8000');
                  checkHealth('http://localhost:8000');
                }}
                className="px-2 py-1 text-slate-400 hover:text-slate-200 underline"
              >
                Reset to Default
              </button>
            </div>
            <div className="text-slate-500">
              Target contract: <span className="font-mono text-slate-400">VerdiqLedger.sol (Amoy)</span>
            </div>
          </div>
        )}
      </header>

      {/* SUB-HEADER / OFFLINE ADVISORY BANNER */}
      {healthStatus === 'unreachable' && (
        <div className="bg-amber-950/40 border-b border-amber-800/40 px-4 py-2.5 text-center text-xs text-amber-300 flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            Unable to connect to FastAPI backend at <code className="font-mono bg-amber-950 px-1 py-0.5 rounded">{apiUrl}</code>. Ensure the server is running (<code className="font-mono">uvicorn main:app --reload --port 8000</code>). You can still load and inspect test samples.
          </span>
          <button
            onClick={() => checkHealth()}
            className="underline font-medium hover:text-white ml-2"
          >
            Retry Now
          </button>
        </div>
      )}

      {/* MAIN VIEWPORT */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* ========================================================================= */}
        {/* 1. DASHBOARD TAB */}
        {/* ========================================================================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Hero / Overview Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-slate-800">
              <div>
                <span className="text-xs uppercase tracking-widest font-mono text-emerald-400 font-medium">
                  Ledger Overview & Telemetry
                </span>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">
                  Environmental Integrity Dashboard
                </h1>
                <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                  Cryptographically stamped batches and anomaly reports verified through dual-layer statistical evaluation and simulated Polygon Amoy blockchain provenance.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveTab('upload')}
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-colors flex items-center gap-2"
                >
                  <UploadCloud className="w-4 h-4" />
                  Upload Batch
                </button>
                <button
                  onClick={() => setActiveTab('verify')}
                  className="px-4 py-2 text-sm font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-lg transition-colors flex items-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Verify Hash
                </button>
              </div>
            </div>

            {/* Summary KPI Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 relative overflow-hidden">
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Total Batches Uploaded
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-white font-mono tabular-nums">
                    {totalBatchesCount}
                  </span>
                  <span className="text-xs text-slate-500">ledger entries</span>
                </div>
                <div className="mt-3 text-xs text-slate-400 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  <span>SQLite & Polygon state</span>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 relative overflow-hidden">
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Anomalies Detected
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`text-3xl font-bold font-mono tabular-nums ${totalAnomaliesCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {totalAnomaliesCount}
                  </span>
                  <span className="text-xs text-slate-500">statistical flags</span>
                </div>
                <div className="mt-3 text-xs text-slate-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  <span>Z-Score & IQR Bounds</span>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 relative overflow-hidden">
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Total Readings Processed
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-white font-mono tabular-nums">
                    {totalReadingsCount.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-500">datapoints</span>
                </div>
                <div className="mt-3 text-xs text-slate-400 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                  <span>100% SHA-256 digested</span>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 relative overflow-hidden">
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Ledger Infrastructure
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-lg font-bold text-emerald-400 font-mono">
                    Polygon Amoy
                  </span>
                </div>
                <div className="mt-3 text-xs text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="truncate">VerdiqLedger.sol (Local Sim)</span>
                </div>
              </div>
            </div>

            {/* Previously Uploaded Batches Table Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Registered Environmental Batches</h2>
                  <p className="text-xs text-slate-400">
                    Audit log of ingested sensor batches, anomaly distributions, and cryptographic transaction hashes
                  </p>
                </div>
                {batches.length > 0 && (
                  <button
                    onClick={() => {
                      if (confirm('Clear local history cache?')) {
                        setBatches([]);
                        localStorage.removeItem('verdiq_cached_batches');
                      }
                    }}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Clear Local Cache
                  </button>
                )}
              </div>

              {batches.length === 0 ? (
                /* Empty State */
                <div className="bg-slate-900/30 border border-dashed border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-950/30 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
                    <FileJson className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-semibold text-white">No batches uploaded yet</h3>
                  <p className="text-sm text-slate-400 max-w-md mt-1 mb-6">
                    Ingest raw sensor JSON files to analyze statistical plausibility, detect anomalies, and generate immutable blockchain provenance hashes.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={() => setActiveTab('upload')}
                      className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <UploadCloud className="w-4 h-4" />
                      Upload Your First Batch
                    </button>
                    <button
                      onClick={() => {
                        loadSampleFile(SAMPLE_NITRATE_BATCH, 'sample_nitrate_batch.json');
                        setActiveTab('upload');
                      }}
                      className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors"
                    >
                      Load Sample Nitrate Dataset
                    </button>
                  </div>
                </div>
              ) : (
                /* Populated Batches Table */
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/50">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-950/80 text-slate-400 text-xs uppercase font-medium border-b border-slate-800">
                        <tr>
                          <th className="py-3 px-4">Batch ID</th>
                          <th className="py-3 px-4">Location</th>
                          <th className="py-3 px-4">Parameter</th>
                          <th className="py-3 px-4 text-right">Readings</th>
                          <th className="py-3 px-4 text-center">Anomalies</th>
                          <th className="py-3 px-4 font-mono">Tx Hash</th>
                          <th className="py-3 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-sans">
                        {batches.map((batch, index) => {
                          const id = getBatchId(batch);
                          const anomalies = getAnomalyCount(batch);
                          const txHash = getTxHash(batch);
                          return (
                            <tr
                              key={`${id}-${index}`}
                              className="hover:bg-slate-800/40 transition-colors group"
                            >
                              <td className="py-3 px-4 font-mono text-emerald-400 font-medium whitespace-nowrap">
                                {id}
                              </td>
                              <td className="py-3 px-4 text-slate-200">
                                <div className="flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                  <span className="truncate max-w-[200px]">{getLocation(batch)}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-slate-300">
                                {getParameter(batch)}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                                {getTotalReadings(batch)}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {anomalies > 0 ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-950/60 text-amber-300 border border-amber-500/30 font-mono tabular-nums">
                                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                                    {anomalies} flagged
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 font-mono tabular-nums">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    0 nominal
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono text-xs text-slate-400 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <span title={txHash}>{truncateTxHash(txHash)}</span>
                                  {txHash && txHash !== '—' && (
                                    <button
                                      onClick={() => handleCopy(txHash, `tx-${index}`)}
                                      className="text-slate-500 hover:text-emerald-400 transition-colors"
                                      title="Copy transaction hash"
                                    >
                                      {copiedKey === `tx-${index}` ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => fetchBatchById(id)}
                                    className="px-2.5 py-1 text-xs font-medium text-emerald-300 hover:text-white bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/30 rounded transition-colors"
                                  >
                                    View Analysis
                                  </button>
                                  <button
                                    onClick={() => openVerifyForBatch(batch)}
                                    className="px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                                    title="Verify batch integrity"
                                  >
                                    Verify
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 2. UPLOAD & ANALYZE TAB */}
        {/* ========================================================================= */}
        {activeTab === 'upload' && (
          <div className="space-y-8">
            <div className="pb-2 border-b border-slate-800">
              <span className="text-xs uppercase tracking-widest font-mono text-emerald-400 font-medium">
                Plausibility & Anomaly Extraction
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">
                Upload & Analyze Sensor Batch
              </h1>
              <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                Submit an environmental sensor batch JSON payload. The engine computes canonical SHA-256 hashes, runs statistical outlier models (Z-score, IQR, rolling statistics), and records registration on the Polygon ledger.
              </p>
            </div>

            {/* Dropzone & Quick Samples Card */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-6">
              {/* Dropzone Container */}
              <div
                onDragOver={e => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    setUploadFile(e.dataTransfer.files[0]);
                    setUploadError(null);
                  }
                }}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                  isDragOver
                    ? 'border-emerald-500 bg-emerald-950/20 scale-[0.99]'
                    : uploadFile
                    ? 'border-emerald-500/50 bg-slate-950/40'
                    : 'border-slate-700/80 hover:border-slate-600 bg-slate-950/20'
                }`}
              >
                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-950/40 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-200">
                      {uploadFile ? (
                        <span className="text-emerald-400 font-mono font-semibold">
                          Selected: {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)
                        </span>
                      ) : (
                        <span>
                          Drag and drop your environmental JSON batch file here, or{' '}
                          <label className="text-emerald-400 hover:text-emerald-300 underline cursor-pointer">
                            browse files
                            <input
                              type="file"
                              accept=".json,application/json"
                              className="hidden"
                              onChange={e => {
                                if (e.target.files && e.target.files[0]) {
                                  setUploadFile(e.target.files[0]);
                                  setUploadError(null);
                                }
                              }}
                            />
                          </label>
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      JSON schema with telemetry readings, timestamps, and parameters
                    </p>
                  </div>

                  {uploadFile && (
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={() => handleUploadSubmit()}
                        disabled={isUploading}
                        className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        {isUploading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Processing Batch...
                          </>
                        ) : (
                          <>
                            <Activity className="w-3.5 h-3.5" />
                            Submit & Run Analysis
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setUploadFile(null)}
                        disabled={isUploading}
                        className="px-3 py-2 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 rounded-lg transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Sample Datasets Preset Buttons */}
              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <FileJson className="w-4 h-4 text-emerald-400" />
                  <span>Test Presets (Click to load):</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => loadSampleFile(SAMPLE_NITRATE_BATCH, 'willamette_river_nitrate.json')}
                    className="px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded border border-slate-700/60 transition-colors"
                  >
                    Load Nitrate Outlier Batch (1 Anomaly)
                  </button>
                  <button
                    onClick={() => loadSampleFile(SAMPLE_CLEAN_PM25_BATCH, 'olympic_air_pm25.json')}
                    className="px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded border border-slate-700/60 transition-colors"
                  >
                    Load Clean PM2.5 Batch (0 Anomalies)
                  </button>
                  <button
                    onClick={() => downloadSampleJson(SAMPLE_NITRATE_BATCH, 'verdiq_sample_batch.json')}
                    className="px-2.5 py-1.5 text-slate-400 hover:text-emerald-400 underline transition-colors"
                  >
                    Download Sample .json
                  </button>
                </div>
              </div>
            </div>

            {/* Error Banner */}
            {uploadError && (
              <div className="p-4 bg-rose-950/40 border border-rose-500/30 rounded-xl text-rose-300 flex items-start gap-3 text-sm">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-rose-200">Batch Processing Error</div>
                  <div className="text-xs text-rose-300/90">{uploadError}</div>
                </div>
              </div>
            )}

            {/* Loading State Spinner */}
            {isUploading && (
              <div className="p-10 bg-slate-900/40 border border-slate-800 rounded-2xl text-center space-y-4">
                <div className="w-12 h-12 border-3 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto" />
                <div>
                  <h3 className="text-base font-semibold text-white">Analyzing Environmental Telemetry...</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                    Calculating SHA-256 payload digest, evaluating rolling Z-scores & IQR outlier bounds, and registering to simulated Polygon Amoy smart contract.
                  </p>
                </div>
              </div>
            )}

            {/* ANALYSIS RESULT DISPLAY */}
            {currentAnalysis && !isUploading && (
              <div className="space-y-6 pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                    <h2 className="text-lg font-semibold text-white">Batch Analysis Report</h2>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    ID: <strong className="text-emerald-400">{getBatchId(currentAnalysis)}</strong>
                  </span>
                </div>

                {/* Batch Metadata Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
                    <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                      Batch ID
                    </div>
                    <div className="text-sm font-bold font-mono text-emerald-400 mt-1 truncate" title={getBatchId(currentAnalysis)}>
                      {getBatchId(currentAnalysis)}
                    </div>
                  </div>

                  <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
                    <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                      Location
                    </div>
                    <div className="text-sm font-semibold text-white mt-1 truncate" title={getLocation(currentAnalysis)}>
                      {getLocation(currentAnalysis)}
                    </div>
                  </div>

                  <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
                    <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                      Parameter
                    </div>
                    <div className="text-sm font-semibold text-slate-200 mt-1 truncate" title={getParameter(currentAnalysis)}>
                      {getParameter(currentAnalysis)}
                    </div>
                  </div>

                  <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
                    <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                      Total Readings
                    </div>
                    <div className="text-sm font-bold font-mono tabular-nums text-white mt-1">
                      {getTotalReadings(currentAnalysis)}
                    </div>
                  </div>

                  <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
                    <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                      Anomaly Count
                    </div>
                    <div className="text-sm font-bold font-mono tabular-nums mt-1">
                      {getAnomalyCount(currentAnalysis) > 0 ? (
                        <span className="text-amber-400">{getAnomalyCount(currentAnalysis)} detected</span>
                      ) : (
                        <span className="text-emerald-400">0 nominal</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Cryptographic Hashes & Ledger Provenance Card */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs uppercase tracking-wider font-semibold text-slate-300">
                        Cryptographic Proof & Ledger State
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>Timestamp:</span>
                      <span className="font-mono text-slate-200">
                        {formatLedgerTimestamp(getLedgerTime(currentAnalysis))}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Data Hash */}
                    <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium">Canonical SHA-256 Data Hash</span>
                        <button
                          onClick={() => handleCopy(getDataHash(currentAnalysis), 'data_hash')}
                          className="text-slate-500 hover:text-emerald-400 flex items-center gap-1 transition-colors"
                        >
                          {copiedKey === 'data_hash' ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-[11px] text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span className="text-[11px]">Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="font-mono text-xs text-emerald-400 break-all select-all bg-slate-900/80 p-2 rounded border border-slate-800">
                        {getDataHash(currentAnalysis)}
                      </div>
                    </div>

                    {/* Tx Hash */}
                    <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium">Polygon Amoy Transaction Hash (tx_hash)</span>
                        <button
                          onClick={() => handleCopy(getTxHash(currentAnalysis), 'tx_hash')}
                          className="text-slate-500 hover:text-emerald-400 flex items-center gap-1 transition-colors"
                        >
                          {copiedKey === 'tx_hash' ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-[11px] text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span className="text-[11px]">Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="font-mono text-xs text-slate-300 break-all select-all bg-slate-900/80 p-2 rounded border border-slate-800">
                        {getTxHash(currentAnalysis)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Anomaly Table Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-white">Statistical Anomaly Log</h3>
                      <p className="text-xs text-slate-400">
                        Readings exceeding dynamic thresholds based on standard deviations (Z-score) and Interquartile Range (IQR). Click any row to view explanation.
                      </p>
                    </div>
                    {getAnomaliesList(currentAnalysis).length > 0 && (
                      <span className="text-xs font-mono text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/20">
                        {getAnomaliesList(currentAnalysis).length} anomalies identified
                      </span>
                    )}
                  </div>

                  {getAnomaliesList(currentAnalysis).length === 0 ? (
                    <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-6 text-center text-sm text-emerald-300 flex flex-col items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2" />
                      <span className="font-semibold text-emerald-200">Clean Telemetry Verified</span>
                      <p className="text-xs text-slate-400 mt-1">
                        All readings conform to expected variance bounds. No statistical outliers, sensor drift, or step-function spikes were detected.
                      </p>
                    </div>
                  ) : (
                    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/50">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-950/80 text-slate-400 text-xs uppercase font-medium border-b border-slate-800">
                            <tr>
                              <th className="py-3 px-4 w-8"></th>
                              <th className="py-3 px-4">Timestamp</th>
                              <th className="py-3 px-4 text-right">Value</th>
                              <th className="py-3 px-4">Unit</th>
                              <th className="py-3 px-4 text-right font-mono">Z-Score</th>
                              <th className="py-3 px-4 text-center font-mono">IQR Bounds</th>
                              <th className="py-3 px-4 text-right font-mono">Rolling Mean</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-sans">
                            {getAnomaliesList(currentAnalysis).map((item, idx) => {
                              const isExpanded = !!expandedAnomalies[idx];
                              const timestamp = item.timestamp || item.time || '—';
                              const value = item.value;
                              const unit = item.unit || '—';
                              const zScore = item.z_score ?? item.zScore ?? item.z;
                              const iqr = item.iqr_bounds ?? item.iqrBounds;
                              const rollingMean = item.rolling_mean ?? item.rollingMean ?? item.mean;
                              const explanation = item.explanation || item.reason || item.details || 'Statistical anomaly detected by algorithmic filter.';

                              return (
                                <React.Fragment key={idx}>
                                  <tr
                                    onClick={() => toggleAnomalyRow(idx)}
                                    className="hover:bg-slate-800/50 transition-colors cursor-pointer select-none group"
                                  >
                                    <td className="py-3 px-4 text-slate-500">
                                      {isExpanded ? (
                                        <ChevronUp className="w-4 h-4 text-emerald-400" />
                                      ) : (
                                        <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />
                                      )}
                                    </td>
                                    <td className="py-3 px-4 font-mono text-xs text-slate-300 whitespace-nowrap">
                                      {timestamp}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono font-bold text-amber-400 tabular-nums">
                                      {formatNumber(value, 2)}
                                    </td>
                                    <td className="py-3 px-4 text-slate-400 text-xs">
                                      {unit}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono text-rose-300 tabular-nums">
                                      {formatNumber(zScore, 2)}
                                    </td>
                                    <td className="py-3 px-4 text-center font-mono text-xs text-slate-400 tabular-nums">
                                      {formatIqrBounds(iqr)}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-300 tabular-nums">
                                      {formatNumber(rollingMean, 2)}
                                    </td>
                                  </tr>

                                  {/* Expandable Explanation Row */}
                                  {isExpanded && (
                                    <tr className="bg-slate-950/60 border-b border-slate-800">
                                      <td colSpan={7} className="py-3 px-6 text-xs">
                                        <div className="flex items-start gap-3 bg-amber-950/20 border border-amber-500/20 rounded-lg p-3 text-slate-300">
                                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                          <div className="space-y-1">
                                            <span className="font-semibold text-amber-300 uppercase tracking-wide text-[10px]">
                                              Anomaly Explanation & Root Cause Diagnosis:
                                            </span>
                                            <p className="leading-relaxed text-slate-200">
                                              {explanation}
                                            </p>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Quick Action to Verify this batch */}
                <div className="pt-4 flex items-center justify-end gap-3">
                  <button
                    onClick={() => openVerifyForBatch(currentAnalysis)}
                    className="px-4 py-2 text-xs font-semibold text-emerald-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-emerald-500/30 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Verify This Batch against Ledger
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 3. VERIFY INTEGRITY TAB */}
        {/* ========================================================================= */}
        {activeTab === 'verify' && (
          <div className="space-y-8">
            <div className="pb-2 border-b border-slate-800">
              <span className="text-xs uppercase tracking-widest font-mono text-emerald-400 font-medium">
                Cryptographic Provenance Check
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">
                Verify Data Integrity
              </h1>
              <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                Test whether a given environmental telemetry file matches the immutable record stored on the blockchain ledger. Any alteration in values, timestamps, or units causes a cryptographic mismatch.
              </p>
            </div>

            {/* Verification Form */}
            <form onSubmit={handleVerifySubmit} className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Batch ID input */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                    Batch ID to Verify
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={verifyBatchId}
                      onChange={e => setVerifyBatchId(e.target.value)}
                      placeholder="e.g. BATCH-2026-WN-049"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-lg font-mono text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                  {batches.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 pt-1">
                      <span>Quick select:</span>
                      {batches.slice(0, 4).map((b, i) => {
                        const bid = getBatchId(b);
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setVerifyBatchId(bid)}
                            className="font-mono text-[11px] text-emerald-400 hover:text-emerald-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800"
                          >
                            {bid}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* File input */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                    Telemetry JSON File
                  </label>
                  <div className="relative">
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          setVerifyFile(e.target.files[0]);
                          setVerifyError(null);
                        }
                      }}
                      className="block w-full text-xs text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-950/60 file:text-emerald-300 hover:file:bg-emerald-900/60 file:cursor-pointer border border-slate-700 rounded-lg bg-slate-950"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Upload the exact file or a modified copy to observe hash divergence.
                  </p>
                </div>
              </div>

              {/* Submit & Sample triggers */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800/80">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Test helper:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setVerifyBatchId("BATCH-2026-WN-049");
                      const jsonStr = JSON.stringify(SAMPLE_NITRATE_BATCH, null, 2);
                      const blob = new Blob([jsonStr], { type: 'application/json' });
                      setVerifyFile(new File([blob], 'willamette_river_original.json', { type: 'application/json' }));
                    }}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                  >
                    Load Authentic Sample
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVerifyBatchId("BATCH-2026-WN-049");
                      // Introduce a slight alteration: change one value
                      const tampered = JSON.parse(JSON.stringify(SAMPLE_NITRATE_BATCH));
                      tampered.readings[0].value = 11.25; // Tampered byte
                      const jsonStr = JSON.stringify(tampered, null, 2);
                      const blob = new Blob([jsonStr], { type: 'application/json' });
                      setVerifyFile(new File([blob], 'willamette_tampered.json', { type: 'application/json' }));
                    }}
                    className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 rounded border border-rose-500/30"
                  >
                    Simulate Tampered File (+0.05 mg/L)
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isVerifying}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
                >
                  {isVerifying ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Verifying Cryptographic Proof...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Submit & Verify Integrity
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Error banner */}
            {verifyError && (
              <div className="p-4 bg-rose-950/40 border border-rose-500/30 rounded-xl text-rose-300 flex items-start gap-3 text-sm">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-rose-200">Verification Request Error</div>
                  <div className="text-xs text-rose-300/90">{verifyError}</div>
                </div>
              </div>
            )}

            {/* VERIFICATION RESULT BANNER & HASH COMPARISON */}
            {verifyResult && (
              <div className="space-y-6 pt-2">
                {/* Result Status Banner */}
                {verifyResult.verified ? (
                  <div className="p-6 bg-emerald-950/40 border-2 border-emerald-500/50 rounded-2xl flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                      <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-emerald-300">
                          Data Integrity Verified: MATCH CONFIRMED
                        </h2>
                        <span className="text-[11px] font-mono bg-emerald-900/60 text-emerald-200 px-2 py-0.5 rounded border border-emerald-500/30">
                          verified: true
                        </span>
                      </div>
                      <p className="text-sm text-slate-300">
                        The cryptographic fingerprint of the submitted file precisely matches the SHA-256 hash registered on the Polygon Amoy blockchain ledger. Zero data tampering or bit-level modifications detected.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-rose-950/40 border-2 border-rose-500/50 rounded-2xl flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                      <XCircle className="w-7 h-7 text-rose-400" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-rose-300">
                          Verification Failed: Data may have been altered
                        </h2>
                        <span className="text-[11px] font-mono bg-rose-900/60 text-rose-200 px-2 py-0.5 rounded border border-rose-500/30">
                          verified: false
                        </span>
                      </div>
                      <p className="text-sm text-slate-300">
                        The submitted file produced a SHA-256 hash that does NOT match the immutable ledger registration. Even a single character or whitespace change causes hash divergence.
                      </p>
                    </div>
                  </div>
                )}

                {/* Side-by-Side Hash Comparison */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                      Side-by-Side SHA-256 Hash Comparison
                    </h3>
                    <span className="text-xs font-mono text-slate-400">
                      Batch: {verifyResult.batch_id || verifyBatchId}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Registered Hash */}
                    <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                          1. Registered Hash (On-Ledger)
                        </span>
                        {verifyResult.registered_hash && (
                          <button
                            onClick={() => handleCopy(verifyResult.registered_hash || '', 'reg_hash')}
                            className="text-slate-500 hover:text-emerald-400 flex items-center gap-1 transition-colors"
                          >
                            {copiedKey === 'reg_hash' ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                      <div className="font-mono text-xs text-emerald-400 break-all select-all bg-slate-900/90 p-3 rounded border border-emerald-500/20">
                        {verifyResult.registered_hash || '—'}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        State committed during original batch ingestion.
                      </p>
                    </div>

                    {/* Submitted Hash */}
                    <div className={`border rounded-lg p-4 space-y-2 ${
                      verifyResult.verified
                        ? 'bg-slate-950/80 border-slate-800'
                        : 'bg-rose-950/20 border-rose-500/30'
                    }`}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                          2. Submitted Hash (Computed from Upload)
                        </span>
                        {verifyResult.submitted_hash && (
                          <button
                            onClick={() => handleCopy(verifyResult.submitted_hash || '', 'sub_hash')}
                            className="text-slate-500 hover:text-emerald-400 flex items-center gap-1 transition-colors"
                          >
                            {copiedKey === 'sub_hash' ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                      <div className={`font-mono text-xs break-all select-all p-3 rounded border ${
                        verifyResult.verified
                          ? 'text-emerald-400 bg-slate-900/90 border-emerald-500/20'
                          : 'text-rose-300 bg-rose-950/60 border-rose-500/40'
                      }`}>
                        {verifyResult.submitted_hash || '—'}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Computed in real-time from the uploaded JSON file bytes.
                      </p>
                    </div>
                  </div>

                  {/* Transaction Hash */}
                  {verifyResult.tx_hash && (
                    <div className="pt-2">
                      <div className="text-xs text-slate-400 mb-1 font-medium">
                        Original Registration Transaction Hash:
                      </div>
                      <div className="flex items-center justify-between bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <span className="font-mono text-xs text-slate-300 break-all select-all">
                          {verifyResult.tx_hash}
                        </span>
                        <button
                          onClick={() => handleCopy(verifyResult.tx_hash || '', 'tx_orig')}
                          className="text-slate-500 hover:text-emerald-400 transition-colors ml-2"
                        >
                          {copiedKey === 'tx_orig' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. ABOUT TAB */}
        {/* ========================================================================= */}
        {activeTab === 'about' && (
          <div className="space-y-8 max-w-4xl">
            <div className="pb-2 border-b border-slate-800">
              <span className="text-xs uppercase tracking-widest font-mono text-emerald-400 font-medium">
                System Architecture & Whitepaper
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">
                About Verdiq
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Verdiq is an AI-assisted environmental data integrity platform designed to solve the twin challenges of environmental monitoring: unvetted telemetry corruption and post-hoc data tampering.
              </p>
            </div>

            {/* Two-Part Trust Model */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                The Two-Part Trust Model
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Traditional compliance frameworks either trust sensor feeds blindly or rely on centralized paper audit trails vulnerable to alteration. Verdiq enforces an automated dual-layer verification protocol:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Layer 1 */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Activity className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-semibold text-white">
                    1. AI Validates Plausibility
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Statistical heuristics, dynamic rolling Z-scores, Interquartile Range (IQR) fence tests, and machine-learning models evaluate raw sensor feeds as they arrive. The system detects biofouling drift, calibration loss, physical sensor clipping, and improbable environmental spikes before ingestion.
                  </p>
                  <ul className="text-xs text-slate-300 space-y-1.5 pt-2">
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Dynamic rolling mean & variance tracking
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Z-score thresholds for standard deviation deviations
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      IQR 1.5× bounds checking for distribution skew
                    </li>
                  </ul>
                </div>

                {/* Layer 2 */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Layers className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-semibold text-white">
                    2. Blockchain Ledger Proves Provenance
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Once analyzed, the canonical batch payload is digested using SHA-256 and committed into a distributed ledger contract. This creates an immutable, timestamped receipt that proves the exact state of the environmental data at the exact moment of collection.
                  </p>
                  <ul className="text-xs text-slate-300 space-y-1.5 pt-2">
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      SHA-256 bit-exact cryptographic hashing
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Simulated Polygon Amoy smart contract ledger
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Instant zero-knowledge tamper detection
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Smart Contract Note */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                Ledger Simulation Notice: <code className="font-mono text-emerald-300">VerdiqLedger.sol</code>
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                In this deployment, the ledger runs locally as a high-fidelity simulation of an EVM-based smart contract (<code className="font-mono text-slate-200">VerdiqLedger.sol</code>) engineered for the <strong>Polygon Amoy testnet</strong>. This architecture preserves the sub-second latency and minimal carbon footprint essential for environmental telemetry while reproducing the exact state interface of an on-chain ledger.
              </p>
              <div className="font-mono text-[11px] bg-slate-950 p-3 rounded border border-slate-800 text-slate-400 overflow-x-auto">
                <span className="text-purple-400">contract</span> <span className="text-emerald-400">VerdiqLedger</span> &#123;<br />
                &nbsp;&nbsp;<span className="text-blue-400">function</span> <span className="text-yellow-300">registerBatch</span>(bytes32 dataHash, string memory batchId, uint256 anomalies) <span className="text-blue-400">external returns</span> (bytes32 txHash);<br />
                &nbsp;&nbsp;<span className="text-blue-400">function</span> <span className="text-yellow-300">verifyBatch</span>(string memory batchId, bytes32 submittedHash) <span className="text-blue-400">external view returns</span> (bool match, bytes32 registeredHash);<br />
                &#125;
              </div>
            </div>

            {/* Tech Stack Breakdown */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                Technology Stack
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
                <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                  <div className="text-emerald-400 font-mono font-semibold">React 19</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">Frontend Single Page App</div>
                </div>
                <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                  <div className="text-emerald-400 font-mono font-semibold">FastAPI</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">Python async REST API</div>
                </div>
                <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                  <div className="text-emerald-400 font-mono font-semibold">SQLite</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">Local persistence layer</div>
                </div>
                <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                  <div className="text-emerald-400 font-mono font-semibold">SHA-256</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">Cryptographic hashing</div>
                </div>
                <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                  <div className="text-emerald-400 font-mono font-semibold">Polygon Amoy</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">Smart contract ledger</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-800/80 bg-slate-950/60 py-6 px-4 sm:px-6 lg:px-8 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span className="font-semibold text-slate-300">Verdiq</span>
            <span>·</span>
            <span>Environmental Data Integrity Platform</span>
          </div>
          <div className="flex items-center gap-4 text-slate-500">
            <span>FastAPI: <code className="font-mono text-slate-400">{apiUrl}</code></span>
            <span>·</span>
            <span>Ledger: <code className="font-mono text-slate-400">VerdiqLedger.sol</code></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
