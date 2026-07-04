from pydantic import BaseModel


class CustomerCreate(BaseModel):
    name: str
    phone: str
    email: str | None = None
    company: str | None = None


class CustomerOut(CustomerCreate):
    id: int
    score: int
    risk_level: str
    debt: float

    class Config:
        from_attributes = True