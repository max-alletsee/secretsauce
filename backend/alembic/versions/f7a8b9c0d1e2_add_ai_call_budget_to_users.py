"""add ai_call_budget to users

Revision ID: f7a8b9c0d1e2
Revises: b1a2c3d4e5f6
Create Date: 2026-07-15

New users receive the default budget from application code
(settings.AI_CALL_BUDGET_DEFAULT); existing rows stay NULL, which means
unlimited — pre-feature users are grandfathered on purpose. Therefore:
no server default, no backfill.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "b1a2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("ai_call_budget", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "ai_call_budget")
