"""
Meta-Lingo Backend Server
FastAPI-based REST API for corpus research software
"""
import sys
import os
import multiprocessing

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from routers import corpus
from routers import analysis
from routers import preprocess
from routers import help
from routers import ollama
from routers import openai_api
from routers import llm_chat
from routers import framework
from routers import annotation
from routers import reliability
from routers import dictionary
from routers import topic_modeling
from routers import collocation
from routers import syntax
from routers import usas
from routers import sketch
from routers import biblio
from routers import corpus_resource
from routers import collocation_analysis
from routers import nrc
from routers import mcp
from routers import model_management
from routers import agent_chat

def _is_multiprocessing_helper_process() -> bool:
    """
    In frozen executables, multiprocessing helpers are launched as:
    - ... --multiprocessing-fork ...
    - ... -c "from multiprocessing.resource_tracker import main;main(...)"
    They must NOT start uvicorn or run app startup side-effects.
    """
    try:
        argv = sys.argv or []
        joined = " ".join(argv)
        if any(arg.startswith("--multiprocessing-fork") for arg in argv):
            return True
        if "multiprocessing.resource_tracker" in joined:
            return True
    except Exception:
        return False
    return False

app = FastAPI(
    title="Meta-Lingo API",
    description="Backend API for Meta-Lingo corpus research software",
    version="1.0.0"
)

# CORS middleware for Electron frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

# Include routers
app.include_router(corpus.router, prefix="/api/corpus", tags=["Corpus"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["Analysis"])
app.include_router(preprocess.router, prefix="/api/preprocess", tags=["Preprocess"])
app.include_router(help.router, prefix="/api/help", tags=["Help"])
app.include_router(ollama.router, prefix="/api/ollama", tags=["Ollama"])
app.include_router(openai_api.router, prefix="/api/openai", tags=["OpenAI API"])
app.include_router(llm_chat.router, prefix="/api/llm", tags=["LLM"])
app.include_router(framework.router, prefix="/api/framework", tags=["Framework"])
app.include_router(annotation.router, prefix="/api/annotation", tags=["Annotation"])
app.include_router(reliability.router, prefix="/api/reliability", tags=["Reliability"])
app.include_router(dictionary.router, prefix="/api/dictionary", tags=["Dictionary"])
app.include_router(topic_modeling.router, prefix="/api/topic-modeling", tags=["Topic Modeling"])
app.include_router(collocation.router, prefix="/api/collocation", tags=["Co-occurrence"])
app.include_router(syntax.router, tags=["Syntax"])
app.include_router(usas.router, tags=["USAS"])
app.include_router(sketch.router, tags=["Word Sketch"])
app.include_router(biblio.router, tags=["Bibliographic"])
app.include_router(corpus_resource.router, prefix="/api/corpus-resource", tags=["Corpus Resource"])
app.include_router(collocation_analysis.router, prefix="/api/collocation-analysis", tags=["Collocation Analysis"])
app.include_router(nrc.router, tags=["NRC"])
app.include_router(mcp.router, prefix="/api/mcp", tags=["MCP"])
app.include_router(model_management.router, prefix="/api/model-management", tags=["Model Management"])
app.include_router(agent_chat.router, prefix="/api/agent", tags=["Agent Chat"])

@app.on_event("startup")
def _copy_built_in_models_to_user_dir():
    """
    On first run (packaged mode), copy built-in models from the bundled location
    into the persistent user models directory so they survive factory reset.
    """
    if _is_multiprocessing_helper_process():
        return

    try:
        from model_paths import copy_built_in_models_to_user_models

        copy_built_in_models_to_user_models()
    except Exception as e:
        # Best-effort: missing built-ins will be handled by service availability checks.
        print(f"[Startup] Failed to copy built-in models: {e}")

    # Cleanup stale tasks exactly once at backend startup.
    # Do NOT do this in models.database module import; download subprocesses also import it.
    try:
        from models.database import TaskDB
        affected = TaskDB.cleanup_stale_tasks()
    except Exception as e:
        pass


@app.get("/")
async def root():
    return {"message": "Meta-Lingo API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    # Required for frozen executables with multiprocessing on macOS/Windows.
    # This lets helper subprocesses run multiprocessing internals correctly
    # instead of entering the normal backend startup path.
    multiprocessing.freeze_support()

    # 获取端口配置（优先使用环境变量）
    port = int(os.environ.get('METALINGO_PORT', 8000))
    
    # 打包模式下禁用 reload，避免端口冲突
    is_packaged = getattr(sys, 'frozen', False)
    
    if is_packaged:
        # 打包模式：直接传递 app 对象，禁用 reload
        uvicorn.run(
            app,  # 直接使用 app 对象，避免模块导入问题
            host="0.0.0.0", 
            port=port, 
            reload=False
        )
    else:
        # 开发模式：使用字符串导入，启用热重载
        uvicorn.run(
            "main:app", 
            host="0.0.0.0", 
            port=port, 
            reload=True
        )
