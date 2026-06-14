import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BackButton } from "../components/BackButton";
import { useCases } from "../lib/CasesContext";

// A pre-disaster preparedness flow, kept separate from active recovery. The
// most valuable thing a household can do before a loss is photograph rooms
// while everything is intact and understand their insurance coverage. We do
// not surface live emergency contacts here, that belongs to the active
// recovery flow.

const CHECKLIST_KEY = "rebuildr.prepare.checklist";

// Low-text, encouraging list of documents worth keeping or uploading now.
const CHECKLIST_ITEMS: { id: string; label: string; hint: string }[] = [
  { id: "policy", label: "Insurance policy", hint: "The full policy document." },
  { id: "declarations", label: "Declarations page", hint: "Your coverage limits at a glance." },
  { id: "home_inventory", label: "Home inventory with photos", hint: "Room-by-room, while intact." },
  { id: "government_id", label: "Government ID", hint: "Driver's licence or passport." },
  { id: "deed_lease", label: "Property deed or lease", hint: "Proof of where you live." },
  { id: "mortgage", label: "Mortgage statement", hint: "Recent statement from your lender." },
  { id: "valuables_receipts", label: "Recent valuables receipts", hint: "Electronics, jewellery, appliances." },
  { id: "emergency_contacts", label: "Emergency contact list", hint: "Kept as a document, ready to grab." },
];

function loadChecklist(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    /* best-effort */
  }
  return {};
}

export default function Prepare() {
  const { latest } = useCases();
  const [checked, setChecked] = useState<Record<string, boolean>>(loadChecklist);

  useEffect(() => {
    try {
      localStorage.setItem(CHECKLIST_KEY, JSON.stringify(checked));
    } catch {
      /* best-effort */
    }
  }, [checked]);

  function toggle(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const doneCount = CHECKLIST_ITEMS.filter((i) => checked[i.id]).length;

  // Pre-loss photos attach to a case's inventory in its "before" phase. If a
  // case already exists, link straight into its inventory, otherwise start one.
  const inventoryTo = latest ? `/cases/${latest.id}/inventory` : "/cases/new";

  return (
    <div className="container" style={{ maxWidth: 820 }}>
      <BackButton to="/dashboard" label="Dashboard" />
      <h1 style={{ marginTop: 16 }}>Get ready before anything happens</h1>
      <p className="warm-note" style={{ marginTop: 8 }}>
        A little preparation now makes any future claim far easier. Two things
        matter most: photograph your home while it is whole, and understand
        your coverage before you ever need it.
      </p>

      <div className="grid grid-2" style={{ marginTop: 8 }}>
        <div className="card accent-card">
          <h3 style={{ marginTop: 0 }}>Photograph your rooms now</h3>
          <p className="muted-strong" style={{ marginTop: 0 }}>
            Photos of each room while everything is intact become your before
            picture. They are the strongest evidence in a catastrophic-loss
            claim, when there may be little left to inspect afterward.
          </p>
          <p className="muted-strong">
            Walk room to room, snap what you own, and we will list and value it
            for you. Keep it updated as you buy new things.
          </p>
          <Link to={inventoryTo}>
            <button className="big">Start a photo inventory</button>
          </Link>
        </div>

        <div className="card info-card">
          <h3 style={{ marginTop: 0 }}>Understand your coverage now</h3>
          <p className="muted-strong" style={{ marginTop: 0 }}>
            Upload your insurance policy and we will pull out your coverage,
            deadlines, and a plain-language summary, so there are no surprises
            when you need to file.
          </p>
          <p className="muted-strong">
            Knowing what you are covered for before a loss is far less stressful
            than learning it during one.
          </p>
          <Link to="/documents">
            <button className="big">Upload your policy</button>
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Your preparedness checklist</h3>
          <span className="spacer" />
          <span className="badge">{doneCount} of {CHECKLIST_ITEMS.length} ready</span>
        </div>
        <p className="muted-strong" style={{ margin: "6px 0 4px" }}>
          Keep or upload these. Tick them off as you go, we save your progress
          on this device.
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
          {CHECKLIST_ITEMS.map((item) => (
            <li key={item.id} className="check-row">
              <input
                type="checkbox"
                id={`prep-${item.id}`}
                checked={!!checked[item.id]}
                onChange={() => toggle(item.id)}
              />
              <label htmlFor={`prep-${item.id}`}>
                <span style={{ fontWeight: 600 }}>{item.label}</span>
                <span className="muted" style={{ display: "block", fontSize: 13 }}>{item.hint}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
