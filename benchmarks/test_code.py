#!/usr/bin/env python3
# test_code.py — Mengeksekusi dan menguji kode python yang dihasilkan LLM secara lokal
# Digunakan sebagai validator promptfoo untuk menjamin zero-hallucination logika coding.

import sys
import json
import traceback

def execute_and_assert(code_str):
    """Mengeksekusi string kode dalam sandbox terisolasi dan menguji hasilnya."""
    local_vars = {}
    try:
        # 1. Eksekusi deklarasi fungsi
        exec(code_str, {}, local_vars)
        
        # Cari fungsi yang dideklarasikan
        target_func = None
        for name, obj in local_vars.items():
            if callable(obj):
                target_func = obj
                break
                
        if not target_func:
            return False, "Error: Tidak ada fungsi yang ditemukan di dalam kode."

        # 2. Kasus Uji Logika (Assertion Tests)
        # Kasus 1: Menguji kalkulasi diskon retail toko HIJILABStore
        # Fungsi yang diharapkan: hitung_diskon_bertingkat(harga_total, jumlah_item)
        # Aturan: >5 item diskon 10%, >10 item diskon 15%, max diskon Rp15.000
        try:
            # Uji 1: >5 item (diskon 10% dari 100k = 10k)
            res1 = target_func(100000, 6)
            assert res1 == 10000, f"Gagal Uji 1 (>5 item): diskon harusnya 10k, hasil={res1}"
            
            # Uji 2: >10 item (diskon 15% dari 200k = 30k -> Terpotong Max Diskon 15k)
            res2 = target_func(200000, 12)
            assert res2 == 15000, f"Gagal Uji 2 (>10 item & max diskon): diskon terpotong max 15k, hasil={res2}"
            
            # Uji 3: Tanpa diskon (< 5 item) = 0
            res3 = target_func(50000, 3)
            assert res3 == 0, f"Gagal Uji 3 (<5 item): tanpa diskon, hasil={res3}"

            # Uji 4: >10 item tanpa menyentuh batas max diskon (diskon 15% dari 80k = 12k)
            # Ini sangat penting untuk membedakan logika elif yang salah (hanya mengambil 10% jika urutan atau kondisi salah)
            res4 = target_func(80000, 11)
            assert res4 == 12000, f"Gagal Uji 4 (>10 item, diskon 15%): diskon harusnya 12k, hasil={res4}"

        except AssertionError as ae:
            return False, f"AssertionFailed: {str(ae)}"
        except Exception as e:
            return False, f"ExecutionError selama pengetesan: {str(e)}"
            
        return True, "Sukses: Kode valid dan lolos seluruh unit test."
        
    except SyntaxError as se:
        return False, f"SyntaxError: {se.msg} di baris {se.lineno}"
    except Exception as e:
        return False, f"RuntimeError saat parsing: {str(e)}\n{traceback.format_exc()}"


def get_assert(output, context):
    """Entry point wajib untuk promptfoo tipe asersi 'python'."""
    # Ekstrak kode asli dari blok markdown ```python ... ```
    code_lines = []
    in_block = False
    for line in output.split("\n"):
        if line.strip().startswith("```python"):
            in_block = True
            continue
        elif line.strip().startswith("```") and in_block:
            in_block = False
            continue
        if in_block:
            code_lines.append(line)
            
    code_to_test = "\n".join(code_lines) if code_lines else output
    
    is_pass, reason = execute_and_assert(code_to_test)
    return {
        "pass": is_pass,
        "reason": reason
    }
