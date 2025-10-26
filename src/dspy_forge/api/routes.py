from fastapi import APIRouter
from dspy_forge.api.endpoints import workflows, execution, config, mcp

router = APIRouter()

router.include_router(workflows.router, prefix="/workflows", tags=["workflows"])
router.include_router(execution.router, prefix="/execution", tags=["execution"])
router.include_router(config.router, prefix="/config", tags=["config"])
router.include_router(mcp.router, prefix="/mcp", tags=["mcp"])
