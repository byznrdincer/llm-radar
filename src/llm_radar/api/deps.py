"""Shared FastAPI dependencies for the api package."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from llm_radar.database.session import get_db

DatabaseSession = Annotated[Session, Depends(get_db)]
