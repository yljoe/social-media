from fastapi import APIRouter

from ..db import init_db
from ..schemas import ApiResponse
from .assets import router as assets_router
from .costs import router as costs_router
from .projects import router as projects_router
from .providers import router as providers_router
from .workspace_profiles import router as workspace_profiles_router


router = APIRouter(prefix="/api")
router.include_router(projects_router)
router.include_router(providers_router)
router.include_router(workspace_profiles_router)
router.include_router(assets_router)
router.include_router(costs_router)


@router.on_event("startup")
def startup() -> None:
    init_db()


@router.get("/health", response_model=ApiResponse)
def health() -> ApiResponse:
    return ApiResponse(data={"ok": True})
