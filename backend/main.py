"""
Meta-Lingo Backend Server
FastAPI-based REST API for corpus research software
"""
import sys
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from routers import corpus
from routers import analysis
from routers import preprocess
from routers import help
from routers import ollama
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
)

# Include routers
app.include_router(corpus.router, prefix="/api/corpus", tags=["Corpus"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["Analysis"])
app.include_router(preprocess.router, prefix="/api/preprocess", tags=["Preprocess"])
app.include_router(help.router, prefix="/api/help", tags=["Help"])
app.include_router(ollama.router, prefix="/api/ollama", tags=["Ollama"])
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


@app.get("/")
async def root():
    return {"message": "Meta-Lingo API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
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
