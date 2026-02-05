"use client";

import { useState, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  Shield,
  AlertTriangle,
  FileSearch,
  ExternalLink,
  CreditCard,
  Link as LinkIcon,
  MessageSquare,
  Zap,
  Trash2,
  Database,
  User as UserIcon,
  ChevronRight,
  Play,
  MousePointer2,
  Crown,
  Ghost
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "../../components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { PERSONAS, Persona, SCAMMER_PERSONAS, ScammerPersona } from "@/lib/personas";

interface Message {
  role: "scammer" | "victim";
  content: string;
}

interface Intelligence {
  upi_ids: string[];
  urls: string[];
  bank_accounts: string[];
  ifsc_codes: string[];
}

export default function HoneypotPage() {
  const [userId, setUserId] = useState<string>("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [intelligence, setIntelligence] = useState<Intelligence>({
    upi_ids: [],
    urls: [],
    bank_accounts: [],
    ifsc_codes: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isScamDetected, setIsScamDetected] = useState<boolean | null>(null);
  const [scamReason, setScamReason] = useState<string>("");
  const [detectedTactic, setDetectedTactic] = useState<string>("");
  const [safeguardTip, setSafeguardTip] = useState<string>("");
  const [conversationId, setConversationId] = useState<string>("");
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(PERSONAS[1].id);
  const [selectedScammerPersonaId, setSelectedScammerPersonaId] = useState<string>("");
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [isSuperAttacker, setIsSuperAttacker] = useState(false);
  const [isSuperVictim, setIsSuperVictim] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let id = localStorage.getItem("honeypotUserId");
    if (!id) {
      id = uuidv4();
      localStorage.setItem("honeypotUserId", id);
    }
    setUserId(id);
    setConversationId("conv_" + uuidv4());
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (messageToSend?: string) => {
    const finalInput = messageToSend || input;
    if (!finalInput.trim() || isLoading) return;

    const scammerMessage = finalInput;
    if (!messageToSend) setInput("");
    setMessages((prev) => [...prev, { role: "scammer", content: scammerMessage }]);
    setIsLoading(true);
    setSuggestions([]);

    try {
      const response = await fetch("/api/honeypot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.NEXT_PUBLIC_API_KEY || "",
        },
        body: JSON.stringify({
          sessionId: conversationId,
          message: {
            sender: "scammer",
            text: scammerMessage,
            timestamp: Date.now()
          },
          conversationHistory: messages.map(m => ({
            sender: m.role,
            text: m.content,
            timestamp: Date.now()
          })),
          metadata: {
            channel: "Web",
            language: "English",
            locale: "IN"
          }
        }),
      });

      const data = await response.json();

      if (response.status !== 200) {
        setMessages((prev) => [...prev, { role: "victim", content: `System Error: ${data.message || "Connection failed"} (Status: ${response.status})` }]);
        return;
      }

      if (data.scam_detected) {
        setIsScamDetected(true);
        setScamReason(data.reason || "High risk patterns detected.");
        setDetectedTactic(data.detected_tactic || "");
        setSafeguardTip(data.safeguard_tip || "");
        setMessages((prev) => [...prev, { role: "victim", content: data.reply }]);

        // Update intelligence
        if (data.extracted_entities) {
          setIntelligence((prev) => ({
            upi_ids: Array.from(new Set([...prev.upi_ids, ...(data.extracted_entities.upi_ids || [])])),
            urls: Array.from(new Set([...prev.urls, ...(data.extracted_entities.urls || [])])),
            bank_accounts: Array.from(new Set([...prev.bank_accounts, ...(data.extracted_entities.bank_accounts || [])])),
            ifsc_codes: Array.from(new Set([...prev.ifsc_codes, ...(data.extracted_entities.ifsc_codes || [])])),
          }));
        }
      } else {
        setIsScamDetected(false);
        setScamReason("");
        setDetectedTactic("");
        setSafeguardTip("");
        setMessages((prev) => [...prev, { role: "victim", content: data.reply || "I didn't understand that. Could you clarify?" }]);
      }

      if (data.suggested_attacker_replies) {
        setSuggestions(data.suggested_attacker_replies);

        // Auto-Pilot Logic: Trigger next message after a delay if in Auto Mode
        if (isAutoMode && data.suggested_attacker_replies.length > 0) {
          setTimeout(() => {
            handleSend(data.suggested_attacker_replies[0]);
          }, 3000); // 3 second "thinking" delay
        }
      }
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [...prev, { role: "victim", content: "Error communicating with the honeypot." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const resetSession = () => {
    setConversationId("conv_" + uuidv4());
    setMessages([]);
    setScamReason("");
    setDetectedTactic("");
    setSafeguardTip("");
    setSuggestions([]);
    setIntelligence({
      upi_ids: [],
      urls: [],
      bank_accounts: [],
      ifsc_codes: [],
    });
    setIsScamDetected(null);
    setSelectedScammerPersonaId("");
    setIsAutoMode(false);
    setIsSuperAttacker(false);
    setIsSuperVictim(false);
  };

  const handleScammerPersonaChange = (id: string) => {
    setSelectedScammerPersonaId(id);
    const persona = SCAMMER_PERSONAS.find(p => p.id === id);
    if (persona && messages.length === 0) {
      setSuggestions(persona.openingLines);
    }
  };

  const currentPersona = PERSONAS.find(p => p.id === selectedPersonaId) || PERSONAS[1];

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-zinc-950 font-sans">
      {/* Header */}
      <header className="h-16 border-b border-slate-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-2">
          <Shield className="text-indigo-600 dark:text-indigo-400 w-6 h-6" />
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Agentic Honeypot
          </h1>
          <Badge variant="outline" className="ml-2 border-indigo-200 text-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-800">
            Intelligence Engine
          </Badge>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-slate-100 dark:bg-zinc-800 p-1 rounded-xl items-center border border-slate-200 dark:border-zinc-700">
            <button
              onClick={() => setIsAutoMode(false)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${!isAutoMode ? 'bg-white dark:bg-zinc-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}
            >
              <MousePointer2 className="w-3.5 h-3.5" />
              Manual
            </button>
            <button
              onClick={() => setIsAutoMode(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isAutoMode ? 'bg-white dark:bg-zinc-700 shadow-sm text-red-600 dark:text-red-400' : 'text-slate-500'}`}
            >
              <Play className="w-3.5 h-3.5" />
              Auto-Pilot
            </button>
          </div>
          <div className="h-8 w-[1px] bg-slate-200 dark:bg-zinc-800" />

          <div className="flex gap-2">
            <button
              onClick={() => setIsSuperAttacker(!isSuperAttacker)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-tighter font-black transition-all border ${isSuperAttacker ? 'bg-zinc-900 text-red-500 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)] animate-pulse' : 'bg-white dark:bg-zinc-800 text-slate-400 border-slate-200 dark:border-zinc-700 opacity-60'}`}
            >
              <Ghost className="w-3 h-3" />
              Super Attacker
            </button>
            <button
              onClick={() => setIsSuperVictim(!isSuperVictim)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-tighter font-black transition-all border ${isSuperVictim ? 'bg-amber-900/10 text-amber-500 border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'bg-white dark:bg-zinc-800 text-slate-400 border-slate-200 dark:border-zinc-700 opacity-60'}`}
            >
              <Crown className="w-3 h-3" />
              Super Victim
            </button>
          </div>

          <div className="h-8 w-[1px] bg-slate-200 dark:bg-zinc-800" />
          <Button variant="ghost" size="sm" onClick={resetSession} className="text-slate-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400">
            <Trash2 className="w-4 h-4 mr-2" />
            Reset Session
          </Button>
          <div className="h-8 w-[1px] bg-slate-200 dark:bg-zinc-800" />
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">User ID</span>
            <span className="text-xs text-slate-600 dark:text-zinc-400 font-mono">{userId.slice(0, 8)}...</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Panel */}
        <div className="flex-1 flex flex-col bg-slate-50 dark:bg-zinc-950">
          <div className="p-4 border-b border-slate-200 dark:border-zinc-900 bg-white dark:bg-zinc-900">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-600 dark:text-zinc-300">Select Victim Persona:</span>
              </div>
              {isScamDetected !== null && (
                <div className="flex gap-2">
                  {detectedTactic && detectedTactic !== "None" && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 shadow-sm flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-500" />
                      {detectedTactic.toUpperCase()}
                    </Badge>
                  )}
                  <Badge
                    className={`${isScamDetected ? 'bg-red-100 text-red-700 border-red-200' : 'bg-green-100 text-green-700 border-green-200'} transition-all duration-300 shadow-sm`}
                  >
                    {isScamDetected ? <AlertTriangle className="w-3 h-3 mr-1" /> : <Shield className="w-3 h-3 mr-1" />}
                    {isScamDetected ? 'SCAM DETECTED' : 'CLEAN MESSAGE'}
                  </Badge>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPersonaId(p.id)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all border ${selectedPersonaId === p.id
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-md scale-105"
                    : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/10"
                    }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <ScrollArea ref={scrollRef} className="flex-1 p-6">
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-4 border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-2xl p-8">
                  <Zap className="w-12 h-12 opacity-20" />
                  <div className="text-center max-w-md">
                    <p className="text-sm font-bold text-slate-600 dark:text-zinc-300 mb-1">
                      Target Victim: {currentPersona.name} {isSuperVictim && <span className="text-amber-500 ml-1">👑 (Super Mode)</span>}
                    </p>
                    <p className="text-xs font-medium opacity-70 mb-4">
                      {isSuperVictim ? "High-Net-Worth individual with complex financial structures. Very difficult to crack." : currentPersona.description}
                    </p>

                    <div className="pt-4 border-t border-slate-100 dark:border-zinc-800">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Choose Your Attacker Persona (Click & Play)</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {SCAMMER_PERSONAS.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => handleScammerPersonaChange(s.id)}
                            disabled={isAutoMode && messages.length > 0}
                            className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all border flex flex-col items-center gap-1 w-32 ${selectedScammerPersonaId === s.id
                              ? "bg-red-600 text-white border-red-600 shadow-lg shadow-red-200 dark:shadow-none"
                              : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-700 hover:border-red-400"
                              } ${isAutoMode && messages.length > 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            <AlertTriangle className={`w-4 h-4 ${selectedScammerPersonaId === s.id ? "text-white" : "text-red-500"}`} />
                            {s.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {selectedScammerPersonaId && (
                    <p className="text-center text-[11px] font-medium mt-4 text-red-500 animate-pulse">
                      {isAutoMode ? "Auto-Pilot Active: Simulation will run automatically." : "Attacker Persona Active: Use suggestions below to start."}
                    </p>
                  )}
                  {!selectedScammerPersonaId && (
                    <p className="text-center text-[11px] font-medium mt-4">
                      Or send a custom message to begin.
                    </p>
                  )}
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "scammer" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-5 py-3 shadow-md transition-all ${m.role === "scammer"
                    ? "bg-slate-800 text-white rounded-tr-none"
                    : "bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-200 border border-slate-100 dark:border-zinc-800 rounded-tl-none ring-1 ring-black/5"
                    }`}>
                    <div className="text-[10px] mb-1 opacity-50 font-bold uppercase tracking-tighter">
                      {m.role === "scammer" ? "Scammer Agent" : `Victim (${currentPersona.name})`}
                    </div>
                    <p className="text-sm leading-relaxed">{m.content}</p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-zinc-900 rounded-2xl px-5 py-3 shadow-sm border border-slate-100 dark:border-zinc-800">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-75" />
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-150" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-6 bg-white dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800 shadow-2xl">
            <div className="max-w-3xl mx-auto space-y-4">
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest w-full mb-1 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Autonomous Suggestions
                  </span>
                  {suggestions.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(s)}
                      className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs hover:bg-indigo-100 dark:hover:bg-indigo-900/20 transition-all flex items-center gap-2 group"
                    >
                      {s}
                      <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <Input
                  placeholder={isAutoMode ? "Auto-Pilot is managing responses..." : "Type a scam message..."}
                  value={input}
                  disabled={isAutoMode}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && handleSend()}
                  className={`flex-1 bg-slate-50 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 h-12 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-medium ${isAutoMode ? 'opacity-50 grayscale' : ''}`}
                />
                <Button onClick={() => handleSend()} disabled={isLoading || isAutoMode} className="h-12 w-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all group">
                  <Zap className={`w-5 h-5 group-hover:scale-110 transition-transform ${isLoading ? 'animate-pulse' : ''}`} />
                </Button>
              </div>
            </div>
            <p className="text-center mt-3 text-[10px] text-slate-400 font-medium tracking-wide uppercase">
              AI Powered Honeypot • Mem0 Intelligence Integration
            </p>
          </div>
        </div>

        {/* Intelligence Dashboard */}
        <div className="w-[400px] border-l border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.1)]">
          <div className="p-5 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/20">
            <h2 className="text-sm font-bold flex items-center gap-2 text-slate-800 dark:text-zinc-100 italic">
              <FileSearch className="w-4 h-4 text-indigo-500" />
              INTELLIGENCE EXTRACTED
            </h2>
            {isScamDetected && (
              <div className="mt-4 space-y-3">
                {scamReason && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-xl">
                    <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">Reason for Detection</p>
                    <p className="text-[11px] text-red-700 dark:text-red-300 leading-tight">{scamReason}</p>
                  </div>
                )}
                {safeguardTip && (
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/20 rounded-xl animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="w-3 h-3 text-indigo-500" />
                      <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Handbook Insight</p>
                    </div>
                    <p className="text-[11px] text-indigo-700 dark:text-indigo-300 leading-tight italic">"{safeguardTip}"</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <ScrollArea className="flex-1 p-5">
            <div className="space-y-6">
              {/* UPI IDs */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                    <Database className="w-3 h-3" />
                    UPI Identifiers
                  </div>
                  <Badge variant="outline" className="text-[10px] py-0">{intelligence.upi_ids.length}</Badge>
                </div>
                {intelligence.upi_ids.length === 0 ? (
                  <div className="text-[11px] text-slate-400 italic bg-slate-50 dark:bg-zinc-800/50 p-3 rounded-lg border border-dashed border-slate-200 dark:border-zinc-800">No UPI IDs extracted yet</div>
                ) : (
                  <div className="space-y-2">
                    {intelligence.upi_ids.map((id, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-xl group transition-all hover:shadow-sm">
                        <span className="text-sm font-mono text-indigo-700 dark:text-indigo-400 truncate">{id}</span>
                        <ExternalLink className="w-3 h-3 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Phishing URLs */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                    <LinkIcon className="w-3 h-3" />
                    Threat URLs
                  </div>
                  <Badge variant="outline" className="text-[10px] py-0">{intelligence.urls.length}</Badge>
                </div>
                {intelligence.urls.length === 0 ? (
                  <div className="text-[11px] text-slate-400 italic bg-slate-50 dark:bg-zinc-800/50 p-3 rounded-lg border border-dashed border-slate-200 dark:border-zinc-800">No phishing links detected</div>
                ) : (
                  <div className="space-y-2">
                    {intelligence.urls.map((url, i) => (
                      <div key={i} className="p-3 bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl space-y-1 group hover:shadow-sm transition-all">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-red-600 dark:text-red-400 font-black uppercase tracking-tighter flex items-center gap-1">
                            <AlertTriangle className="w-2 h-2" /> High Risk
                          </span>
                          <ExternalLink className="w-3 h-3 text-red-300 opacity-0 group-hover:opacity-100" />
                        </div>
                        <p className="text-xs font-mono text-red-700 dark:text-red-400 break-all">{url}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bank Details */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                    <CreditCard className="w-3 h-3" />
                    Account Intelligence
                  </div>
                  <Badge variant="outline" className="text-[10px] py-0">{intelligence.bank_accounts.length + intelligence.ifsc_codes.length}</Badge>
                </div>
                {(intelligence.bank_accounts.length === 0 && intelligence.ifsc_codes.length === 0) ? (
                  <div className="text-[11px] text-slate-400 italic bg-slate-50 dark:bg-zinc-800/50 p-3 rounded-lg border border-dashed border-slate-200 dark:border-zinc-800">No bank details extracted</div>
                ) : (
                  <div className="space-y-2">
                    {intelligence.bank_accounts.map((acc, i) => (
                      <div key={i} className="p-3 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Account Number</p>
                          <p className="text-sm font-mono text-slate-700 dark:text-zinc-300">•••• •••• {acc.slice(-4)}</p>
                        </div>
                        <Shield className="w-4 h-4 text-slate-300" />
                      </div>
                    ))}
                    {intelligence.ifsc_codes.map((ifsc, i) => (
                      <div key={i} className="p-3 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">IFSC Code</p>
                        <p className="text-sm font-mono text-slate-700 dark:text-zinc-300">{ifsc}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          <div className="p-6 bg-slate-50 dark:bg-zinc-950 border-t border-slate-200 dark:border-zinc-900">
            <div className="flex items-start gap-3 p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm">
              <Shield className="w-8 h-8 text-indigo-500 opacity-50 shrink-0" />
              <div className="space-y-1">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System Status</h4>
                <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-tight">
                  Continuously monitoring conversation for adversarial patterns. All data logged to Mem0.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
