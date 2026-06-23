import React, { useState } from 'react';

export function Slide1_TheReality() {
  return (
    <div className="flex h-screen w-full font-sans shadow-2xl">
      {/* Before Section */}
      <div className="flex-1 bg-rose-50 p-16 flex flex-col justify-center border-r-8 border-white">
        <h2 className="text-5xl font-extrabold text-rose-900 mb-8">Before Rebuildr</h2>
        <ul className="space-y-6 text-2xl text-rose-800 font-medium">
          <li className="flex items-start">
            <span className="mr-4">❌</span> 
            Scavenging for lost paperwork in the aftermath
          </li>
          <li className="flex items-start">
            <span className="mr-4">❌</span> 
            Navigating fragmented, confusing government links
          </li>
          <li className="flex items-start">
            <span className="mr-4">❌</span> 
            Missing tight insurance deadlines due to overwhelm
          </li>
          <li className="flex items-start">
            <span className="mr-4">❌</span> 
            Weeks of bureaucratic red tape while displaced
          </li>
        </ul>
        <div className="mt-16 p-8 bg-white/60 rounded-2xl shadow-sm border border-rose-100">
          <p className="italic text-xl text-rose-950 leading-relaxed">
            "The administrative nightmare of insurance and recovery is often as traumatizing as the event itself."
          </p>
          <p className="mt-4 font-bold text-rose-800">— Real Wildfire Survivor</p>
        </div>
      </div>

      {/* After Section */}
      <div className="flex-1 bg-emerald-50 p-16 flex flex-col justify-center">
        <h2 className="text-5xl font-extrabold text-emerald-900 mb-8">With Rebuildr</h2>
        <ul className="space-y-6 text-2xl text-emerald-800 font-medium">
          <li className="flex items-start">
            <span className="mr-4">✅</span> 
            A centralized, supportive digital recovery hub
          </li>
          <li className="flex items-start">
            <span className="mr-4">✅</span> 
            AI instantly extracts strict deadlines & claim data
          </li>
          <li className="flex items-start">
            <span className="mr-4">✅</span> 
            Automatic matching to active local relief resources
          </li>
          <li className="flex items-start">
            <span className="mr-4">✅</span> 
            Filing time cut from agonizing weeks to mere hours
          </li>
        </ul>
        <div className="mt-16 p-8 bg-white/60 rounded-2xl shadow-sm border border-emerald-100">
          <p className="italic text-xl text-emerald-950 leading-relaxed">
            "Keeping the focus entirely on the recovery of the people impacted, not the paperwork."
          </p>
          <p className="mt-4 font-bold text-emerald-800">— The Rebuildr Mission</p>
        </div>
      </div>
    </div>
  );
}


export function Slide2_InteractiveMenu() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categories = [
    { 
      id: 'ai', 
      title: 'AI Accuracy & Trust',   
      description: 'Estimates, YOLOv8 accuracy, and handling bad photos.',
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-900' 
    },
    { 
      id: 'privacy', 
      title: 'Privacy & Security', 
      description: 'PII Redaction, Supabase RLS, and data encryption.',
      color: 'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-900' 
    },
    { 
      id: 'access', 
      title: 'Accessibility & Roadmap', 
      description: 'Digital literacy, offline access, and future scaling.',
      color: 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-900' 
    }
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 p-16 font-sans">
      <div className="text-center mb-20">
        <h2 className="text-6xl font-black text-slate-800 mb-6 tracking-tight">
          Behind the Scenes of Rebuildr
        </h2>
        <p className="text-3xl text-slate-600 font-light">
          What area would you like to dive into next?
        </p>
      </div>

      <div className="flex gap-8 justify-center max-w-7xl mx-auto w-full">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`flex-1 flex flex-col items-center justify-center p-12 rounded-3xl border-2 shadow-sm transition-all duration-300 transform hover:-translate-y-2 hover:shadow-xl ${cat.color} ${activeCategory === cat.id ? 'ring-4 ring-offset-4 ring-slate-400' : ''}`}
          >
            <span className="text-3xl font-bold text-center mb-4">{cat.title}</span>
            <span className="text-lg text-center opacity-80">{cat.description}</span>
          </button>
        ))}
      </div>

      {/* Dynamic Content Area */}
      <div className="mt-16 flex-1 w-full max-w-7xl mx-auto">
        {activeCategory === 'ai' && (
          <div className="p-8 bg-white rounded-2xl shadow-lg border border-slate-100 animate-fade-in-up">
            <h3 className="text-2xl font-bold text-blue-900 mb-4">AI Accuracy & Trust Answers...</h3>
            {/* You can plug in your AI FAQ component here */}
          </div>
        )}
        
        {activeCategory === 'privacy' && (
          <div className="p-8 bg-white rounded-2xl shadow-lg border border-slate-100 animate-fade-in-up">
            <h3 className="text-2xl font-bold text-purple-900 mb-4">Privacy & Security Answers...</h3>
            {/* You can plug in your Privacy FAQ component here */}
          </div>
        )}

        {activeCategory === 'access' && (
          <div className="p-8 bg-white rounded-2xl shadow-lg border border-slate-100 animate-fade-in-up">
            <h3 className="text-2xl font-bold text-amber-900 mb-4">Accessibility & Roadmap Answers...</h3>
            {/* You can plug in your Accessibility FAQ component here */}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Presentation() {
  return (
    <div>
      <Slide1_TheReality />
      {/* You can add navigation logic here to switch between slides */}
      <Slide2_InteractiveMenu />
    </div>
  );
}