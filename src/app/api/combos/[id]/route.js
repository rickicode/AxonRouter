import { NextResponse } from "next/server";
import { getComboById, updateCombo, deleteCombo, getComboByName } from "@/lib/localDb";
import { resetComboRotation } from "open-sse/services/combo.js";
import { delSharedCounter } from "@/lib/cache/client.js";
import { CORE_MODEL_COMBOS, GENERAL_LATEST_COMBOS } from "open-sse/config/coreModelCombos.js";

const BUILTIN_COMBO_NAMES = new Set([
  ...Object.keys(CORE_MODEL_COMBOS || {}),
  ...Object.keys(GENERAL_LATEST_COMBOS || {}),
  "smart-model",
]);

function isBuiltinCombo(combo) {
  if (!combo?.name) return false;
  const name = combo.name.trim().toLowerCase();
  if (BUILTIN_COMBO_NAMES.has(name)) return true;
  if (name.endsWith("-latest")) return true;
  if (name === "gemini-flash" || name === "gemini-pro" || name === "claude" || name === "gpt") return true;
  return false;
}

// Reset both rotation states for a combo name: the in-memory map and the
// shared sequence (a stale rr_seq would address the wrong member after
// a member add/remove/reorder).
function resetComboRotationState(name) {
  if (!name) return;
  resetComboRotation(name);
  delSharedCounter(`rr_seq:${name}`).catch(() => {});
}

// Validate combo name: only a-z, A-Z, 0-9, -, _
const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\-/]+$/;

// GET /api/combos/[id] - Get combo by ID
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const combo = await getComboById(id);
    
    if (!combo) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }
    
    return NextResponse.json(combo);
  } catch (error) {
    console.log("Error fetching combo:", error);
    return NextResponse.json({ error: "Failed to fetch combo" }, { status: 500 });
  }
}

// PUT /api/combos/[id] - Update combo
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    // Validate name format if provided
    if (body.name) {
      if (!VALID_NAME_REGEX.test(body.name)) {
        return NextResponse.json({ error: "Name can only contain letters, numbers, -, _, . and /" }, { status: 400 });
      }
      
      // Check if name already exists (exclude current combo)
      const existing = await getComboByName(body.name);
      if (existing && existing.id !== id) {
        return NextResponse.json({ error: "Combo name already exists" }, { status: 400 });
      }
    }
    
    // Capture previous name to invalidate rotation state on rename
    const prev = await getComboById(id);
    if (!prev) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }

    if (isBuiltinCombo(prev) && body.name && body.name !== prev.name) {
      return NextResponse.json({ error: "Built-in preset combo name cannot be changed" }, { status: 400 });
    }

    const combo = await updateCombo(id, body);
    
    if (!combo) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }

    // Invalidate rotation state (models/strategy/name may have changed)
    if (prev?.name) resetComboRotationState(prev.name);
    if (combo.name && combo.name !== prev?.name) resetComboRotationState(combo.name);

    return NextResponse.json(combo);
  } catch (error) {
    console.log("Error updating combo:", error);
    return NextResponse.json({ error: "Failed to update combo" }, { status: 500 });
  }
}

// DELETE /api/combos/[id] - Delete combo
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const prev = await getComboById(id);
    if (!prev) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }

    if (isBuiltinCombo(prev)) {
      return NextResponse.json({ error: "Built-in preset combos cannot be deleted" }, { status: 403 });
    }

    const success = await deleteCombo(id);
    if (!success) {
      return NextResponse.json({ error: "Failed to delete combo" }, { status: 500 });
    }

    if (prev?.name) resetComboRotationState(prev.name);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting combo:", error);
    return NextResponse.json({ error: "Failed to delete combo" }, { status: 500 });
  }
}
