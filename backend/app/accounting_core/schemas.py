from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class LedgerAccountCreate(BaseModel):
    code: str
    name: str
    account_type: str = "asset"
    parent_id: Optional[int] = None
    description: str = ""


class LedgerAccountOut(BaseModel):
    id: int
    code: str
    name: str
    account_type: str
    parent_id: Optional[int] = None
    is_active: bool
    description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class JournalLineCreate(BaseModel):
    account_id: int
    debit: float = 0
    credit: float = 0
    description: str = ""
    customer_id: Optional[int] = None
    product_id: Optional[int] = None


class JournalEntryCreate(BaseModel):
    entry_date: Optional[datetime] = None
    source_type: str = "manual"
    source_id: Optional[int] = None
    description: str = ""
    lines: List[JournalLineCreate]


class JournalLineOut(BaseModel):
    id: int
    account_id: int
    debit: float
    credit: float
    description: Optional[str] = None
    customer_id: Optional[int] = None
    product_id: Optional[int] = None

    class Config:
        from_attributes = True


class JournalEntryOut(BaseModel):
    id: int
    entry_number: str
    entry_date: datetime
    source_type: Optional[str] = None
    source_id: Optional[int] = None
    description: Optional[str] = None
    status: str
    lines: List[JournalLineOut] = []

    class Config:
        from_attributes = True