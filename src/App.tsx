import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Search, Zap, AlertCircle, Download, Copy, Sparkles, Clock, CheckCircle2, ChevronRight, LogIn, LogOut, Trash2 } from 'lucide-react';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { v4 as uuidv4 } from 'uuid';
import html2pdf from 'html2pdf.js';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Toaster, toast } from 'sonner';

import { auth, db, signInWithGoogle, signOut } from './lib/firebase';
import { collection, doc, setDoc, getDocs, query, where, orderBy, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';

interface ScorecardData {
  status: 'Investible' | 'Avoid' | 'Pivot Required';
  stage: string;
  timing: string;
  risk: string;
  summary: string;
}

interface AnalysisData {
  concept: string;
  validation: string;
  competitors: string;
  scorecard: ScorecardData;
}

interface HistoryItem {
  id: string;
  idea: string;
  data: AnalysisData;
  sources: string[];
  date: string;
}

const IDEAS = [
  "AI-powered personalized nutrition based on gut microbiome",
  "Decentralized freelance platform with escrow smart contracts",
  "Sustainable packaging for e-commerce using mushroom mycelium",
  "Gamified financial literacy app for Gen Z",
  "B2B SaaS for predictive maintenance of wind turbines"
];

export default function App() {
  const [idea, setIdea] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<AnalysisData | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isStarted, setIsStarted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        loadFirebaseHistory(currentUser.uid);
      } else {
        setHistory([]);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadFirebaseHistory = async (userId: string) => {
    setIsHistoryLoading(true);
    try {
      const q = query(
        collection(db, 'history'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const historyData: HistoryItem[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        historyData.push({
          id: doc.id,
          idea: data.idea,
          data: data.data,
          sources: data.sources || [],
          date: data.date
        });
      });
      setHistory(historyData);
    } catch (err) {
      console.error("Failed to load history from Firebase:", err);
      // Fallback to local storage if Firebase fails or rules deny
      const savedHistory = sessionStorage.getItem('vc_history');
      if (savedHistory) {
        try {
          setHistory(JSON.parse(savedHistory));
        } catch (e) {
          console.error("Failed to parse local history");
        }
      }
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const saveHistory = async (newItem: HistoryItem) => {
    const newHistory = [newItem, ...history];
    setHistory(newHistory);
    sessionStorage.setItem('vc_history', JSON.stringify(newHistory));

    if (user) {
      try {
        await setDoc(doc(db, 'history', newItem.id), {
          userId: user.uid,
          idea: newItem.idea,
          data: newItem.data,
          sources: newItem.sources,
          date: newItem.date,
          createdAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Failed to save history to Firebase:", err);
      }
    }
  };

  const deleteHistoryItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      if (user) {
        await deleteDoc(doc(db, 'history', id));
      }
      const newHistory = history.filter(item => item.id !== id);
      setHistory(newHistory);
      sessionStorage.setItem('vc_history', JSON.stringify(newHistory));
      toast.success("History item deleted");
    } catch (err) {
      console.error("Failed to delete history item:", err);
      toast.error("Failed to delete history item");
    }
  };

  const handleFeelingLucky = () => {
    const randomIdea = IDEAS[Math.floor(Math.random() * IDEAS.length)];
    setIdea(randomIdea);
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setIdea(item.idea);
    setResult(item.data);
    setSources(item.sources);
    setIsStarted(true);
    setError(null);
  };

  const handleAnalyze = async () => {
    if (!idea.trim()) return;

    setIsStarted(true);
    setIsLoading(true);
    setError(null);
    setResult(null);
    setSources([]);
    setLoadingStep(0);

    const steps = ["Expanding Idea...", "Searching Competitors...", "Analyzing Market...", "Finalizing Scorecard..."];
    let stepIndex = 0;
    const interval = setInterval(() => {
      stepIndex = (stepIndex + 1) % steps.length;
      setLoadingStep(stepIndex);
    }, 1500);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idea }),
      });

      const resData = await response.json();
      clearInterval(interval);

      if (!response.ok) {
        throw new Error(resData.error || 'Failed to analyze idea');
      }

      setResult(resData.data);
      if (resData.searchSources) {
        setSources(resData.searchSources);
      }

      saveHistory({
        id: uuidv4(),
        idea,
        data: resData.data,
        sources: resData.searchSources || [],
        date: new Date().toISOString()
      });

    } catch (err: any) {
      clearInterval(interval);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (!result || !reportRef.current) return;
    const opt: any = {
      margin:       1,
      filename:     'vc-due-diligence-report.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    // Add a temporary class to ensure light mode colors for printing
    reportRef.current.classList.add('pdf-exporting');
    html2pdf().set(opt).from(reportRef.current).save().then(() => {
        reportRef.current?.classList.remove('pdf-exporting');
    });
  };

  const copyToClipboard = (text: string, sectionName: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${sectionName} to clipboard`);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <Toaster position="top-right" />
      
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shadow-sm flex-shrink-0 z-10">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
              <Zap className="w-5 h-5 text-indigo-600" />
              VC Due Diligence Agent
            </h1>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-widest mt-1 hidden sm:block">
              Track A Prototyping | Gemini 1.5 Pro + Search
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Sheet>
            <SheetTrigger render={
              <Button variant="outline" size="sm" className="hidden sm:flex items-center gap-2">
                <Clock className="w-4 h-4" /> History
              </Button>
            } />
            <SheetContent className="w-[400px] sm:w-[540px]">
              <SheetHeader>
                <SheetTitle>Analysis History</SheetTitle>
              </SheetHeader>
              {!user && (
                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-lg mt-6 mb-4 flex flex-col items-center justify-center text-center">
                  <p className="text-sm text-indigo-800 mb-3">Sign in to sync your history across devices.</p>
                  <Button variant="default" size="sm" onClick={signInWithGoogle} className="bg-indigo-600 hover:bg-indigo-700 w-full">
                    <LogIn className="w-4 h-4 mr-2" />
                    Sign in with Google
                  </Button>
                </div>
              )}
              <ScrollArea className="h-[calc(100vh-160px)] mt-4 pr-4">
                {isHistoryLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                  </div>
                ) : history.length === 0 ? (
                  <div className="text-center text-slate-500 py-8 text-sm">No history yet.</div>
                ) : (
                  <div className="space-y-4">
                    {history.map(item => (
                      <div key={item.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200 cursor-pointer hover:border-indigo-300 transition-colors relative group" onClick={() => loadHistoryItem(item)}>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 h-8 w-8"
                          onClick={(e) => deleteHistoryItem(e, item.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <h4 className="font-semibold text-sm line-clamp-2 mb-2 pr-8">{item.idea}</h4>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <Badge variant={item.data.scorecard.status === 'Investible' ? 'default' : item.data.scorecard.status === 'Avoid' ? 'destructive' : 'secondary'}>
                            {item.data.scorecard.status}
                          </Badge>
                          <span>{new Date(item.date).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </SheetContent>
          </Sheet>

          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600 hidden md:block">{user.email}</span>
              <Button variant="ghost" size="icon" onClick={signOut} className="h-8 w-8 text-slate-500 hover:text-slate-800" title="Sign out">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={signInWithGoogle} className="hidden sm:flex items-center gap-2">
              <LogIn className="w-4 h-4" /> Sign In
            </Button>
          )}

          <span className="flex items-center gap-2 text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
            <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span> Active
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto relative bg-slate-50">
        <div className={`max-w-6xl mx-auto p-4 sm:p-6 transition-all duration-700 ease-in-out ${isStarted ? 'pt-6' : 'pt-[15vh] sm:pt-[25vh]'}`}>
          
          <AnimatePresence mode="popLayout">
            {!isStarted && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20, height: 0, marginBottom: 0 }}
                className="text-center mb-10"
              >
                <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 mb-4">Validate ideas at lightspeed.</h2>
                <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                  Enter a keyword or business concept. Our AI agent will expand it, research real competitors, and grade it like a Tier 1 VC.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div layout className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 flex flex-col gap-4 mb-6 z-20 relative">
            <div className="flex items-center justify-between">
              <label htmlFor="idea" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Project Input</label>
              <Button variant="ghost" size="sm" onClick={handleFeelingLucky} className="h-7 px-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 text-xs">
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                I'm Feeling Lucky
              </Button>
            </div>
            <Textarea
              id="idea"
              className="min-h-[100px] text-base resize-none focus-visible:ring-indigo-500 bg-slate-50/50"
              placeholder="e.g., 'An AI app that helps farmers detect crop diseases' or 'AI solar panel cleaner'"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey) handleAnalyze();
              }}
            />
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2">
              <span className="text-xs text-slate-400 hidden sm:block">Press <kbd className="font-mono bg-slate-100 px-1 py-0.5 rounded border border-slate-200 text-slate-500">⌘ + Enter</kbd> to analyze</span>
              <Button 
                onClick={handleAnalyze} 
                disabled={isLoading || !idea.trim()}
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 rounded-xl px-8"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Running Analysis...
                  </>
                ) : (
                  <>
                    Run Deep Venture Analysis
                    <ChevronRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </motion.div>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-red-50 p-4 rounded-xl border border-red-200 shadow-sm flex flex-col gap-2 mb-6"
              >
                <div className="flex items-center text-red-600 gap-2 font-bold text-xs uppercase">
                  <AlertCircle className="w-4 h-4" />
                  Analysis Failed
                </div>
                <p className="text-sm text-red-700">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isLoading && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm flex flex-col items-center justify-center min-h-[300px]"
              >
                <div className="relative w-20 h-20 mb-8">
                  <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                  <Zap className="absolute inset-0 m-auto w-6 h-6 text-indigo-600 animate-pulse" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Analyzing the Market</h3>
                <div className="h-6 overflow-hidden flex justify-center items-center">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={loadingStep}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-slate-500 font-medium"
                    >
                      {["Expanding Idea...", "Searching Competitors...", "Analyzing Market...", "Finalizing Scorecard..."][loadingStep]}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {result && !isLoading && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ staggerChildren: 0.1, delayChildren: 0.1 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative"
            >
              
              {/* Main Report Column */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden" ref={reportRef}>
                  <div className="border-b border-slate-100 p-4 bg-slate-50 flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-700">Due Diligence Report</span>
                    <Button variant="outline" size="sm" onClick={handleExport} className="h-8 gap-2 bg-white">
                      <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Export PDF</span>
                    </Button>
                  </div>
                  
                  <div className="p-6 sm:p-8 space-y-10">
                    
                    {/* Concept */}
                    <motion.section 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="relative group"
                    >
                      <Button variant="ghost" size="icon" className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-slate-400 hover:text-indigo-600" onClick={() => copyToClipboard(result.concept, "Concept")}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <h2 className="text-xl font-bold text-slate-900 border-l-4 border-indigo-500 pl-4 mb-4 flex items-center gap-2">
                         Expanded Business Concept
                      </h2>
                      <div className="markdown-body text-slate-700">
                        <Markdown>{result.concept}</Markdown>
                      </div>
                    </motion.section>
                    
                    <Separator />

                    {/* Validation */}
                    <motion.section 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="relative group"
                    >
                      <Button variant="ghost" size="icon" className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-slate-400 hover:text-indigo-600" onClick={() => copyToClipboard(result.validation, "Validation")}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <h2 className="text-xl font-bold text-slate-900 border-l-4 border-indigo-500 pl-4 mb-4 flex items-center gap-2">
                        Problem & Market Validation
                      </h2>
                      <div className="markdown-body text-slate-700">
                        <Markdown>{result.validation}</Markdown>
                      </div>
                    </motion.section>

                    <Separator />

                    {/* Competitors */}
                    <motion.section 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="relative group"
                    >
                      <Button variant="ghost" size="icon" className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-slate-400 hover:text-indigo-600" onClick={() => copyToClipboard(result.competitors, "Competitors")}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <h2 className="text-xl font-bold text-slate-900 border-l-4 border-indigo-500 pl-4 mb-4 flex items-center gap-2">
                        Competitive Landscape & USP
                      </h2>
                      <div className="markdown-body text-slate-700">
                        <Markdown>{result.competitors}</Markdown>
                      </div>
                    </motion.section>

                  </div>
                </div>
              </div>

              {/* Sidebar Column */}
              <div className="lg:col-span-1 space-y-6">
                
                {/* Scorecard */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
                >
                  <div className="border-b border-slate-100 p-4 bg-slate-900 text-white">
                    <h3 className="font-bold flex items-center gap-2">
                      <TrendingUpIcon className="w-4 h-4 text-emerald-400" />
                      Investability Scorecard
                    </h3>
                  </div>
                  <div className="p-5 space-y-5">
                    
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Status</div>
                      <div className={`flex items-center gap-2 text-sm font-bold ${
                        result.scorecard.status === 'Investible' ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' :
                        result.scorecard.status === 'Avoid' ? 'text-red-700 bg-red-50 border border-red-200' :
                        'text-amber-700 bg-amber-50 border border-amber-200'
                      } px-3 py-2 rounded-lg`}>
                        {result.scorecard.status === 'Investible' && <CheckCircle2 className="w-4 h-4" />}
                        {result.scorecard.status === 'Avoid' && <AlertCircle className="w-4 h-4" />}
                        {result.scorecard.status === 'Pivot Required' && <Zap className="w-4 h-4" />}
                        {result.scorecard.status}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="text-[10px] text-indigo-600 font-bold uppercase mb-1">Stage</div>
                        <div className="text-sm font-bold text-slate-800">{result.scorecard.stage}</div>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="text-[10px] text-amber-600 font-bold uppercase mb-1">Timing</div>
                        <div className="text-sm font-bold text-slate-800">{result.scorecard.timing}</div>
                      </div>
                    </div>

                    <div className="bg-red-50/50 p-3 rounded-lg border border-red-100">
                      <div className="text-[10px] text-red-600 font-bold uppercase mb-1">Main Risk</div>
                      <div className="text-sm font-semibold text-slate-800 leading-snug">{result.scorecard.risk}</div>
                    </div>

                    <Separator />

                    <div className="pt-2">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">VC Candid Take</div>
                      <p className="text-sm text-slate-600 italic bg-slate-50 p-4 rounded-lg border-l-2 border-indigo-300">
                        "{result.scorecard.summary}"
                      </p>
                    </div>

                  </div>
                </motion.div>

                {/* Grounding Sources */}
                {sources.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white border border-slate-200 rounded-2xl shadow-sm"
                  >
                     <div className="border-b border-slate-100 p-4 bg-slate-50">
                        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                          <Search className="w-4 h-4" /> Grounding Evidence
                        </h3>
                     </div>
                    <div className="p-4">
                      <ul className="space-y-3">
                        {sources.map((source, index) => (
                          <li key={index} className="flex gap-2 items-start group cursor-pointer" onClick={() => copyToClipboard(source, "Source URL")}>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                            <span className="text-[11px] text-slate-600 break-words group-hover:text-indigo-600 transition-colors line-clamp-3 leading-snug">{source}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                )}
              </div>

            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}

function TrendingUpIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  )
}
