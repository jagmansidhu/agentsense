from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from proxy.config import settings

async_engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)

AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_session():
    async with AsyncSessionLocal() as session:
        yield session
