"""make_import_task_url_nullable_add_image_path

Revision ID: b1c2d3e4f5a6
Revises: 9dba554eadfe
Create Date: 2026-04-05 21:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, Sequence[str], None] = '9dba554eadfe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Make url nullable
    op.alter_column('import_tasks', 'url',
                    existing_type=sa.Text(),
                    nullable=True)
    # Add image_path column
    op.add_column('import_tasks',
                  sa.Column('image_path', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove image_path column
    op.drop_column('import_tasks', 'image_path')
    # Make url non-nullable again
    op.alter_column('import_tasks', 'url',
                    existing_type=sa.Text(),
                    nullable=False)
