"""baseline

Revision ID: 6fc787a3f0b6
Revises:
Create Date: 2026-05-10 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision: str = "6fc787a3f0b6"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sessions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("agent_id", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="healthy"),
        sa.Column("last_seen", sa.DateTime(), nullable=False),
        sa.Column("event_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("anomaly_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("metadata", JSONB(), nullable=False, server_default="{}"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "turns",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("turn_index", sa.Integer(), nullable=False),
        sa.Column("thinking", sa.Text(), nullable=True),
        sa.Column("action", sa.String(), nullable=True),
        sa.Column("tool_calls", JSONB(), nullable=False, server_default="[]"),
        sa.Column("output", sa.Text(), nullable=True),
        sa.Column("user_goal", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_turns_session_id", "turns", ["session_id"])
    op.create_index("ix_turns_created_at", "turns", ["created_at"])

    op.create_table(
        "health_events",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("turn_id", UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("all_scores", JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"]),
        sa.ForeignKeyConstraint(["turn_id"], ["turns.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_health_events_turn_id", "health_events", ["turn_id"])
    op.create_index("ix_health_events_session_id", "health_events", ["session_id"])
    op.create_index("ix_health_events_created_at", "health_events", ["created_at"])


def downgrade() -> None:
    op.drop_table("health_events")
    op.drop_table("turns")
    op.drop_table("sessions")
