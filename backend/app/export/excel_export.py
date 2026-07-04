from openpyxl import Workbook

EXCEL_PATH = "vetrix_invoices.xlsx"


def build_invoice_excel(invoices):
    wb = Workbook()
    ws = wb.active

    ws.title = "Invoices"

    headers = ["ID", "Type", "Customer", "Total", "Status"]

    ws.append(headers)

    for inv in invoices:
        ws.append([
            inv.id,
            inv.invoice_type,
            inv.customer_id,
            inv.total_amount,
            inv.status,
        ])

    wb.save(EXCEL_PATH)

    return EXCEL_PATH