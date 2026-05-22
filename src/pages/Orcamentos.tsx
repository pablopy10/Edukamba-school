import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { buildProformaInvoicePdf, type ProformaInvoicePdfInput } from "@/lib/fiscal/proformaInvoicePdf";
import { downloadConvertedInvoiceWithProforma } from "@/lib/fiscal/downloadFiscalInvoicePdf";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Download, FileText, FileCheck, Trash2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { invokeCreditNote } from "@/lib/fiscal/invokeCreditNote";
import { downloadCreditNotePdfById } from "@/lib/fiscal/downloadCreditNotePdf";
import {
  CREDIT_NOTE_REASON_CODES,
  type CreditNoteReasonCode,
  resolveCreditNoteReasonText,
} from "@/lib/fiscal/creditNoteReasons";
import { effectiveSchoolIdFromProfile } from "@/lib/effectiveTenant";
import { useUserRole } from "@/hooks/useUserRole";

const CONSUMER_FALLBACK_NIF = "999999999";

type SchoolInfo = {
  id: string;
  name: string;
  nif: string | null;
  address: string | null;
};

type ProformaRow = {
  id: string;
  document_number: string;
  issue_date: string;
  validity_days: number;
  client_name: string;
  client_lines: string[];
  client_nif: string | null;
  client_email: string | null;
  items: Array<{ description: string; quantity: number; unit_amount: string; total_amount: string }>;
  subtotal: string;
  iva_percentage: number;
  iva_amount: string;
  total: string;
  currency: string;
  footer_note: string | null;
  hash_control: string | null;
  converted_invoice_id: string | null;
  created_at: string;
  created_by_id: string | null;
  school_id: string | null;
};

const Orcamentos = () => {
  const { user } = useAuth();
  const { role } = useUserRole();
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [rows, setRows] = useState<ProformaRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    clientName: "",
    clientLines: "",
    clientNif: "",
    clientEmail: "",
    issueDate: new Date().toISOString().slice(0, 10),
    validityDays: "30",
    items: [{ description: "", quantity: 1, unitAmount: "", totalAmount: "" }],
    currency: "AOA",
    ivaPct: "0",
    footerNote: "",
  });
