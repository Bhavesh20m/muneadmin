import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { QrCode, Smartphone, X, Copy, Check, ExternalLink } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTable?: (tableId: string) => void;
}

export const TableQrModal: React.FC<Props> = ({ isOpen, onClose, onNavigateToTable }) => {
  const [selectedTable, setSelectedTable] = useState('5');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const origin = window.location.origin;
  const relativePath = `/customer/dineflow-demo/table/${selectedTable}`;
  const fullUrl = `${origin}${relativePath}`;

  useEffect(() => {
    if (!isOpen) return;
    QRCode.toDataURL(fullUrl, {
      width: 260,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('QR Gen error:', err));
  }, [fullUrl, isOpen, selectedTable]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenCustomer = () => {
    if (onNavigateToTable) {
      onNavigateToTable(selectedTable);
      onClose();
    } else {
      window.open(relativePath, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <QrCode className="w-5 h-5 text-slate-300" />
            <h3 className="font-semibold text-base">Table QR & NFC Destinations</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-md"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* NFC Card Notice Banner */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Smartphone className="w-5 h-5 text-slate-800 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
                  Configured NFC Card Target
                </p>
                <p className="text-sm text-slate-700 mt-0.5 font-mono">
                  /customer/dineflow-demo/table/5
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Guaranteed to open ONLY the customer menu for Table 5. Never accesses staff or admin routes.
                </p>
              </div>
            </div>
          </div>

          {/* Table Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-2">
              Select Dining Table
            </label>
            <div className="grid grid-cols-4 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSelectedTable(t)}
                  className={`py-2 px-3 text-sm font-medium rounded-lg border transition-all text-center ${
                    selectedTable === t
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Table {t}
                  {t === '5' && (
                    <span className="block text-[10px] text-slate-400 font-normal">NFC Demo</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* QR Code Display */}
          <div className="flex flex-col items-center justify-center p-4 bg-gray-50 border border-gray-200 rounded-xl">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code for Table ${selectedTable}`}
                className="w-48 h-48 rounded-lg shadow-xs bg-white p-2 border border-gray-200"
              />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center text-slate-400 text-sm">
                Generating QR...
              </div>
            )}
            <span className="text-xs font-medium text-slate-600 mt-2">
              Scan to order from <span className="font-bold text-slate-900">Table {selectedTable}</span>
            </span>
          </div>

          {/* URL & Action buttons */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={fullUrl}
                className="w-full text-xs font-mono px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-slate-700 truncate"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg text-slate-700 text-xs font-medium flex items-center gap-1.5 flex-shrink-0 transition-colors"
                title="Copy link"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <button
              type="button"
              onClick={handleOpenCustomer}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <ExternalLink className="w-4 h-4" />
              Open Customer Menu for Table {selectedTable}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
