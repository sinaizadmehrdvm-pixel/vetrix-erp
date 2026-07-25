from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal

router = APIRouter(prefix="/product-categories", tags=["Product Categories"])


class ProductCategory(Base):
    __tablename__ = "product_categories"

    id = Column(Integer, primary_key=True, index=True)
    main_category = Column(String, nullable=False)
    sub_category = Column(String, default="")
    code = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class ProductCategoryCreate(BaseModel):
    main_category: str
    sub_category: str = ""
    code: str = ""


def _category_dict(category):
    return {
        "id": category.id,
        "main_category": category.main_category,
        "sub_category": category.sub_category or "",
        "code": category.code or "",
        "created_at": category.created_at.isoformat() if category.created_at else None,
    }


@router.get("")
def list_categories():
    db: Session = SessionLocal()
    try:
        categories = db.query(ProductCategory).order_by(ProductCategory.main_category, ProductCategory.sub_category).all()
        return [_category_dict(c) for c in categories]
    finally:
        db.close()


@router.post("")
def create_category(data: ProductCategoryCreate):
    db: Session = SessionLocal()
    try:
        main_category = data.main_category.strip()
        if not main_category:
            raise ValueError("Main category is required")
        sub_category = data.sub_category.strip()

        duplicate = (
            db.query(ProductCategory)
            .filter(
                ProductCategory.main_category == main_category,
                ProductCategory.sub_category == sub_category,
            )
            .first()
        )
        if duplicate:
            raise ValueError("This category already exists")

        category = ProductCategory(
            main_category=main_category,
            sub_category=sub_category,
            code=data.code.strip(),
        )
        db.add(category)
        db.commit()
        db.refresh(category)
        return {"status": "created", **_category_dict(category)}
    except ValueError as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    except Exception as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    finally:
        db.close()


@router.delete("/{category_id}")
def delete_category(category_id: int):
    db: Session = SessionLocal()
    try:
        category = db.query(ProductCategory).filter(ProductCategory.id == category_id).first()
        if not category:
            return {"status": "error", "message": "Category not found"}
        db.delete(category)
        db.commit()
        return {"status": "deleted", "id": category_id}
    except Exception as error:
        db.rollback()
        return {"status": "error", "message": str(error)}
    finally:
        db.close()
