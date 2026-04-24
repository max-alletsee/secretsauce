"""merge_search_vector_into_main

Revision ID: f2a3b4c5d6e7
Revises: 9a4778a26e60, e1f2a3b4c5d6
Create Date: 2026-04-24 00:01:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic
revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, Sequence[str], None] = ("9a4778a26e60", "e1f2a3b4c5d6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
