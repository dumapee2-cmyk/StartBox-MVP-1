import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

interface Props {
  appId: string;
  shortId: string;
  runCount?: number;
}

export function ShareBar({ appId, shortId, runCount }: Props) {
  const [copied, setCopied] = useState(false);
  const [forking, setForking] = useState(false);
  const navigate = useNavigate();

  const shareUrl = `${window.location.origin}/share/${shortId}`;

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function fork() {
    setForking(true);
    try {
      const result = await api.forkApp(appId);
      navigate(`/app/${result.id}`);
    } catch {
      setForking(false);
    }
  }

  return (
    <div className="share-bar">
      {runCount !== undefined && (
        <span className="run-count">Run {runCount} times</span>
      )}
      <button onClick={copyLink} className="btn btn-secondary">
        {copied ? 'Copied!' : 'Share Link'}
      </button>
      <button onClick={fork} disabled={forking} className="btn btn-ghost">
        {forking ? 'Forking...' : 'Fork App'}
      </button>
    </div>
  );
}
