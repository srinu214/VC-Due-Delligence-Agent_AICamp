import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Search, Zap, AlertCircle, Download, Copy, Sparkles, Clock, CheckCircle2, ChevronRight, LogIn, LogOut, Trash2, MessageSquare } from 'lucide-react';
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

interface SentimentData {
  overallScore: number;
  trend: 'Improving' | 'Declining' | 'Stable';
  breakdown: {
    news: number;
    social: number;
    expert: number;
  };
  keyDrivers: string[];
  summary: string;
}

interface AnalysisData {
  concept: string;
  validation: string;
  competitors: string;
  scorecard: ScorecardData;
  sentiment?: SentimentData;
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

function BackgroundGlow() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10 bg-background">
      <motion.div 
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full mix-blend-screen filter blur-[100px] bg-primary/20"
      />
      <motion.div 
        animate={{ 
          scale: [1, 1.3, 1],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full mix-blend-screen filter blur-[120px] bg-emerald-500/10"
      />
    </div>
  );
}

function AnimatedScoreGauge({ status }: { status: string }) {
  const score = status === 'Investible' ? 92 : status === 'Avoid' ? 24 : 58;
  const color = status === 'Investible' ? '#10B981' : status === 'Avoid' ? '#EF4444' : '#F59E0B';
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center py-4">
      <div className="relative w-36 h-36 flex items-center justify-center drop-shadow-[0_0_15px_rgba(0,0,0,0.5)]">
        <svg className="transform -rotate-90 w-full h-full drop-shadow-md">
          <circle cx="72" cy="72" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-800/50" />
          <motion.circle
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
            cx="72"
            cy="72"
            r={radius}
            stroke={color}
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={circumference}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 8px ${color})` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1 }}
            className="text-4xl font-black" style={{ color }}
          >
            {score}
          </motion.span>
        </div>
      </div>
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
        className="mt-4 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase border"
        style={{ color, borderColor: color, backgroundColor: `${color}15` }}
      >
        {status}
      </motion.div>
    </div>
  );
}

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
    <div className="flex flex-col h-screen w-full bg-background text-foreground font-sans overflow-hidden">
      <BackgroundGlow />
      <Toaster position="top-right" />
      
      <header className="flex items-center justify-between px-6 py-4 bg-card/80 backdrop-blur border-b border-border shadow-sm flex-shrink-0 z-10">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <img src="/src/assets/images/app_icon_1782579439315.jpg" className="w-6 h-6 rounded border border-border" alt="App Logo" />
              VC Due Diligence Agent
            </h1>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mt-1 hidden sm:block">
              Track A Prototyping | Gemini 1.5 Pro + Search
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Sheet>
            <SheetTrigger render={
              <Button variant="outline" size="sm" className="hidden sm:flex items-center gap-2 bg-card/50 hover:bg-card">
                <Clock className="w-4 h-4" /> History
              </Button>
            } />
            <SheetContent className="w-[400px] sm:w-[540px] bg-card border-l-border">
              <SheetHeader>
                <SheetTitle className="text-foreground">Analysis History</SheetTitle>
              </SheetHeader>
              {!user && (
                <div className="bg-primary/10 border border-primary/20 p-4 rounded-lg mt-6 mb-4 flex flex-col items-center justify-center text-center">
                  <p className="text-sm text-primary mb-3">Sign in to sync your history across devices.</p>
                  <Button variant="default" size="sm" onClick={signInWithGoogle} className="bg-primary hover:bg-primary/90 w-full text-primary-foreground">
                    <LogIn className="w-4 h-4 mr-2" />
                    Sign in with Google
                  </Button>
                </div>
              )}
              <ScrollArea className="h-[calc(100vh-160px)] mt-4 pr-4">
                {isHistoryLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : history.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8 text-sm">No history yet.</div>
                ) : (
                  <div className="space-y-4">
                    {history.map(item => (
                      <div key={item.id} className="bg-background/50 p-4 rounded-lg border border-border cursor-pointer hover:border-primary/50 transition-colors relative group" onClick={() => loadHistoryItem(item)}>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 h-8 w-8 transition-all"
                          onClick={(e) => deleteHistoryItem(e, item.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <h4 className="font-semibold text-sm line-clamp-2 mb-2 pr-8 text-foreground">{item.idea}</h4>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
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
              <span className="text-xs text-muted-foreground hidden md:block">{user.email}</span>
              <Button variant="ghost" size="icon" onClick={signOut} className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Sign out">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={signInWithGoogle} className="hidden sm:flex items-center gap-2 bg-card/50 hover:bg-card">
              <LogIn className="w-4 h-4" /> Sign In
            </Button>
          )}

          <span className="flex items-center gap-2 text-xs font-semibold px-2.5 py-1 bg-primary/10 text-primary rounded-full border border-primary/20">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse"></span> Active
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto relative bg-transparent">
        <div className={`max-w-6xl mx-auto p-4 sm:p-6 transition-all duration-700 ease-in-out ${isStarted ? 'pt-6' : 'pt-[15vh] sm:pt-[25vh]'}`}>
          
          <AnimatePresence mode="popLayout">
            {!isStarted && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20, height: 0, marginBottom: 0 }}
                className="text-center mb-10"
              >
                <h2 className="text-4xl font-extrabold tracking-tight text-foreground mb-4">Validate ideas at lightspeed.</h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Enter a keyword or business concept. Our AI agent will expand it, research real competitors, and grade it like a Tier 1 VC.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div layout className="bg-card/90 backdrop-blur p-5 sm:p-6 rounded-2xl border border-border shadow-2xl shadow-primary/5 flex flex-col gap-4 mb-6 z-20 relative hover:shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-shadow duration-500">
            <div className="flex items-center justify-between">
              <label htmlFor="idea" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Project Input</label>
              <Button variant="ghost" size="sm" onClick={handleFeelingLucky} className="h-7 px-2 text-primary hover:text-primary hover:bg-primary/10 text-xs transition-colors">
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                I'm Feeling Lucky
              </Button>
            </div>
            <Textarea
              id="idea"
              className="min-h-[100px] text-base resize-none focus-visible:ring-primary bg-background/50 border-border"
              placeholder="e.g., 'An AI app that helps farmers detect crop diseases' or 'AI solar panel cleaner'"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey) handleAnalyze();
              }}
            />
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2">
              <span className="text-xs text-muted-foreground hidden sm:block">Press <kbd className="font-mono bg-background px-1 py-0.5 rounded border border-border text-muted-foreground">⌘ + Enter</kbd> to analyze</span>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full sm:w-auto">
                <Button 
                  onClick={handleAnalyze} 
                  disabled={isLoading || !idea.trim()}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 rounded-xl px-8 transition-colors"
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
              </motion.div>
            </div>
          </motion.div>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-red-500/10 p-4 rounded-xl border border-red-500/20 shadow-sm flex flex-col gap-2 mb-6 backdrop-blur"
              >
                <div className="flex items-center text-red-500 gap-2 font-bold text-xs uppercase">
                  <AlertCircle className="w-4 h-4" />
                  Analysis Failed
                </div>
                <p className="text-sm text-red-400">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isLoading && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative"
              >
                <div className="lg:col-span-2 bg-card/50 backdrop-blur border border-border rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col gap-8 h-[600px] animate-pulse">
                  <div className="flex flex-col gap-4">
                    <div className="h-6 w-1/3 bg-primary/20 rounded"></div>
                    <div className="h-4 w-full bg-border rounded"></div>
                    <div className="h-4 w-5/6 bg-border rounded"></div>
                    <div className="h-4 w-4/6 bg-border rounded"></div>
                  </div>
                  <div className="flex flex-col gap-4 mt-8">
                    <div className="h-6 w-1/4 bg-primary/20 rounded"></div>
                    <div className="h-4 w-full bg-border rounded"></div>
                    <div className="h-4 w-5/6 bg-border rounded"></div>
                  </div>
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm rounded-2xl">
                    <div className="relative w-20 h-20 mb-8">
                      <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
                      <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-primary animate-pulse" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground mb-2">Analyzing the Market</h3>
                    <div className="h-6 overflow-hidden flex justify-center items-center">
                      <AnimatePresence mode="wait">
                        <motion.p
                          key={loadingStep}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="text-primary font-medium"
                        >
                          {["Expanding Idea...", "Searching Competitors...", "Analyzing Market...", "Finalizing Scorecard..."][loadingStep]}
                        </motion.p>
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-1 space-y-6 animate-pulse">
                  <div className="bg-card/50 backdrop-blur border border-border rounded-2xl p-6 h-64">
                    <div className="h-6 w-1/2 bg-primary/20 rounded mb-8"></div>
                    <div className="flex justify-center mb-6">
                      <div className="w-32 h-32 rounded-full bg-border/50"></div>
                    </div>
                  </div>
                  <div className="bg-card/50 backdrop-blur border border-border rounded-2xl p-6 h-48">
                    <div className="h-6 w-1/2 bg-primary/20 rounded mb-4"></div>
                    <div className="h-4 w-full bg-border rounded mb-2"></div>
                    <div className="h-4 w-full bg-border rounded mb-2"></div>
                    <div className="h-4 w-3/4 bg-border rounded"></div>
                  </div>
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
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
                  className="bg-card border border-border rounded-2xl shadow-xl shadow-black/20 overflow-hidden relative group/card hover:border-primary/30 transition-colors" ref={reportRef}>
                  <div className="border-b border-border p-4 bg-background/50 flex justify-between items-center">
                    <span className="text-sm font-bold text-foreground">Due Diligence Report</span>
                    <Button variant="outline" size="sm" onClick={handleExport} className="h-8 gap-2 bg-transparent hover:bg-card">
                      <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Export PDF</span>
                    </Button>
                  </div>
                  
                  <div className="p-6 sm:p-8 space-y-10">
                    
                    {/* Concept */}
                    <motion.section 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="relative group"
                    >
                      <Button variant="ghost" size="icon" className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => copyToClipboard(result.concept, "Concept")}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <h2 className="text-xl font-bold text-foreground border-l-4 border-primary pl-4 mb-4 flex items-center gap-2">
                         Expanded Business Concept
                      </h2>
                      <div className="markdown-body text-muted-foreground">
                        <Markdown>{result.concept}</Markdown>
                      </div>
                    </motion.section>
                    
                    <Separator className="bg-border/50" />

                    {/* Validation */}
                    <motion.section 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 }}
                      className="relative group"
                    >
                      <Button variant="ghost" size="icon" className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => copyToClipboard(result.validation, "Validation")}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <h2 className="text-xl font-bold text-foreground border-l-4 border-primary pl-4 mb-4 flex items-center gap-2">
                        Problem & Market Validation
                      </h2>
                      <div className="markdown-body text-muted-foreground">
                        <Markdown>{result.validation}</Markdown>
                      </div>
                    </motion.section>

                    <Separator className="bg-border/50" />

                    {/* Competitors */}
                    <motion.section 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 }}
                      className="relative group"
                    >
                      <Button variant="ghost" size="icon" className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => copyToClipboard(result.competitors, "Competitors")}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <h2 className="text-xl font-bold text-foreground border-l-4 border-primary pl-4 mb-4 flex items-center gap-2">
                        Competitive Landscape & USP
                      </h2>
                      <div className="markdown-body text-muted-foreground">
                        <Markdown>{result.competitors}</Markdown>
                      </div>
                    </motion.section>

                  </div>
                </motion.div>
              </div>

              {/* Sidebar Column */}
              <div className="lg:col-span-1 space-y-6">
                
                {/* Scorecard */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-card border border-border rounded-2xl shadow-xl shadow-black/20 overflow-hidden group/card hover:border-primary/30 transition-colors"
                >
                  <div className="border-b border-border p-4 bg-background/50 text-foreground">
                    <h3 className="font-bold flex items-center gap-2">
                      <TrendingUpIcon className="w-4 h-4 text-emerald-400" />
                      Investability Scorecard
                    </h3>
                  </div>
                  <div className="p-5 space-y-5">
                    
                    <AnimatedScoreGauge status={result.scorecard.status} />

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-background/50 p-3 rounded-lg border border-border">
                        <div className="text-[10px] text-primary font-bold uppercase mb-1">Stage</div>
                        <div className="text-sm font-bold text-foreground">{result.scorecard.stage}</div>
                      </div>
                      <div className="bg-background/50 p-3 rounded-lg border border-border">
                        <div className="text-[10px] text-amber-500 font-bold uppercase mb-1">Timing</div>
                        <div className="text-sm font-bold text-foreground">{result.scorecard.timing}</div>
                      </div>
                    </div>

                    <div className="bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                      <div className="text-[10px] text-red-500 font-bold uppercase mb-1">Main Risk</div>
                      <div className="text-sm font-semibold text-red-100 leading-snug">{result.scorecard.risk}</div>
                    </div>

                    <Separator className="bg-border/50" />

                    <div className="pt-2">
                      <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-2">VC Candid Take</div>
                      <p className="text-sm text-foreground/90 italic bg-background/30 p-4 rounded-lg border-l-2 border-primary/50">
                        "{result.scorecard.summary}"
                      </p>
                    </div>

                  </div>
                </motion.div>

                {/* Market Sentiment */}
                {result.sentiment && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-card border border-border rounded-2xl shadow-xl shadow-black/20 overflow-hidden group/card hover:border-blue-500/30 transition-colors"
                  >
                    <div className="border-b border-border p-4 bg-background/50 text-foreground">
                      <h3 className="font-bold flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-blue-400" />
                        Market Sentiment Analysis
                      </h3>
                    </div>
                    <div className="p-5 space-y-5">
                      
                      {/* Overall Score */}
                      <div>
                        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-2">Overall Score</div>
                        <div className="flex items-center gap-4">
                          <div className={`text-3xl font-black ${
                            result.sentiment.overallScore >= 0.5 ? 'text-emerald-400' :
                            result.sentiment.overallScore <= -0.5 ? 'text-red-400' :
                            'text-foreground/90'
                          }`}>
                            {result.sentiment.overallScore > 0 ? '+' : ''}{result.sentiment.overallScore.toFixed(2)}
                          </div>
                          <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                            result.sentiment.overallScore >= 0.5 ? 'bg-emerald-500/20 text-emerald-400' :
                            result.sentiment.overallScore <= -0.5 ? 'bg-red-500/20 text-red-400' :
                            'bg-border text-foreground/90'
                          }`}>
                            {result.sentiment.overallScore >= 0.5 ? 'BULLISH' : result.sentiment.overallScore <= -0.5 ? 'BEARISH' : 'NEUTRAL'}
                          </div>
                        </div>
                      </div>

                      {/* Trend */}
                      <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-border">
                        <span className="text-xs font-bold text-muted-foreground uppercase">Trend</span>
                        <span className="text-sm font-bold flex items-center gap-1 text-foreground">
                          {result.sentiment.trend === 'Improving' ? '📈' : result.sentiment.trend === 'Declining' ? '📉' : '↔️'} {result.sentiment.trend}
                        </span>
                      </div>

                      {/* Breakdown */}
                      <div className="space-y-3">
                        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Breakdown</div>
                        
                        <div className="space-y-2">
                          {[
                            { label: 'News', score: result.sentiment.breakdown.news },
                            { label: 'Social', score: result.sentiment.breakdown.social },
                            { label: 'Expert', score: result.sentiment.breakdown.expert }
                          ].map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                              <span className="text-xs font-medium text-muted-foreground w-12">{item.label}</span>
                              <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.abs(item.score) * 100}%` }}
                                  transition={{ duration: 1, ease: "easeOut", delay: 0.5 }}
                                  className={`h-full ${item.score >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                                />
                              </div>
                              <span className={`text-xs font-bold w-10 text-right ${
                                item.score > 0 ? 'text-emerald-400' : item.score < 0 ? 'text-red-400' : 'text-muted-foreground'
                              }`}>
                                {item.score > 0 ? '+' : ''}{item.score.toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Key Drivers */}
                      <div className="pt-2">
                        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-2">Key Drivers</div>
                        <ul className="space-y-2 text-sm text-foreground/90">
                          {result.sentiment.keyDrivers.map((driver, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                              <span className="leading-tight">{driver}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      
                      <Separator className="bg-border/50" />
                      
                      <p className="text-xs text-muted-foreground italic">
                        {result.sentiment.summary}
                      </p>

                    </div>
                  </motion.div>
                )}

                {/* Grounding Sources */}
                {sources.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-card border border-border rounded-2xl shadow-xl shadow-black/20 overflow-hidden group/card hover:border-emerald-500/30 transition-colors"
                  >
                     <div className="border-b border-border p-4 bg-background/50">
                        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                          <Search className="w-4 h-4" /> Grounding Evidence
                        </h3>
                     </div>
                    <div className="p-4">
                      <ul className="space-y-3">
                        {sources.map((source, index) => (
                          <li key={index} className="flex gap-2 items-start group cursor-pointer" onClick={() => copyToClipboard(source, "Source URL")}>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0 group-hover:text-emerald-400 transition-colors" />
                            <span className="text-[11px] text-muted-foreground break-words group-hover:text-primary transition-colors line-clamp-3 leading-snug">{source}</span>
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
