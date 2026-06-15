import { useNavigate } from "react-router-dom";
import { api, Case } from "../api";
import { useCases } from "./CasesContext";

// Starting recovery is a deliberate commit point: it creates a DRAFT case up
// front so the intake form has somewhere to autosave into, surviving an app
// close. Shared by the Prepare home button and the nav phase chip so both
// behave identically. Reuses the existing api.createCase helper, no new
// endpoint. If a draft already exists we reuse it rather than piling up
// half-started cases.
export function useStartRecovery() {
  const { activeDraft, refresh } = useCases();
  const nav = useNavigate();
  return async function startRecovery(): Promise<Case> {
    if (activeDraft) {
      nav("/cases/new");
      return activeDraft;
    }
    const res = await api.createCase({ status: "draft" });
    await refresh();
    nav("/cases/new");
    return res.case;
  };
}
