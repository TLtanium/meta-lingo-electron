import React, { useState, useMemo, useCallback, useEffect } from 'react'
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Breadcrumbs,
  Link,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Chip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Tooltip,
  Collapse,
  InputAdornment
} from '@mui/material'
import {
  ArrowBack as ArrowBackIcon,
  Home as HomeIcon,
  NavigateNext as NavigateNextIcon,
  Folder as FolderIcon,
  Label as LabelIcon,
  CreateNewFolder as NewFolderIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Description as DefinitionIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Search as SearchIcon,
  UnfoldMore as ExpandAllIcon,
  UnfoldLess as CollapseAllIcon,
  KeyboardArrowRight as ArrowRightIcon
} from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import { frameworkApi } from '../../../api/framework'
import type { Framework, FrameworkNode } from './types'

interface FrameworkDetailProps {
  framework: Framework
  onBack: () => void
  onUpdate: (framework: Framework) => void
}

// Tree node component for preview
interface TreeNodeProps {
  node: FrameworkNode
  path: string[]
  level: number
  expanded: Set<string>
  onToggle: (path: string) => void
  onNavigate: (path: string[]) => void
  searchQuery: string
}

const TreeNodeItem: React.FC<TreeNodeProps> = ({
  node,
  path,
  level,
  expanded,
  onToggle,
  onNavigate,
  searchQuery
}) => {
  const pathStr = path.join('/')
  const isExpanded = expanded.has(pathStr)
  const hasChildren = node.children && node.children.length > 0
  const isTier = node.type === 'tier'
  
  const matchesSearch = searchQuery 
    ? node.name.toLowerCase().includes(searchQuery.toLowerCase())
    : true
  
  const hasMatchingDescendant = useCallback((n: FrameworkNode): boolean => {
    if (!searchQuery) return true
    if (n.name.toLowerCase().includes(searchQuery.toLowerCase())) return true
    if (n.children) {
      return n.children.some(child => hasMatchingDescendant(child))
    }
    return false
  }, [searchQuery])
  
  const shouldShow = !searchQuery || matchesSearch || hasMatchingDescendant(node)
  
  if (!shouldShow) return null
  
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          py: 0.5,
          pl: level * 2,
          cursor: 'pointer',
          borderRadius: 1,
          '&:hover': { bgcolor: 'action.hover' },
          ...(matchesSearch && searchQuery && { bgcolor: 'action.selected' })
        }}
        onClick={() => onNavigate(path)}
      >
        <Box sx={{ width: 24, display: 'flex', justifyContent: 'center' }}>
          {hasChildren ? (
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onToggle(pathStr) }}
              sx={{ p: 0.25 }}
            >
              {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
            </IconButton>
          ) : <Box sx={{ width: 24 }} />}
        </Box>
        
        {isTier ? (
          <FolderIcon fontSize="small" color="primary" sx={{ mr: 1 }} />
        ) : (
          <Box
            sx={{
              width: 18,
              height: 18,
              borderRadius: 0.5,
              bgcolor: node.color || 'grey.400',
              mr: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <LabelIcon sx={{ fontSize: 12, color: 'white' }} />
          </Box>
        )}
        
        <Typography variant="body2" sx={{ flex: 1, fontWeight: isTier ? 500 : 400 }}>
          {node.name}
        </Typography>
        
        <Chip
          size="small"
          label={isTier ? 'T' : 'L'}
          sx={{ 
            height: 16, 
            fontSize: '0.65rem',
            bgcolor: isTier ? 'primary.main' : node.color || 'grey.400',
            color: 'white'
          }}
        />
      </Box>
      
      {hasChildren && (
        <Collapse in={isExpanded || (!!searchQuery && hasMatchingDescendant(node))}>
          {node.children!.map((child) => (
            <TreeNodeItem
              key={child.id || `${pathStr}/${child.name}`}
              node={child}
              path={[...path, child.name]}
              level={level + 1}
              expanded={expanded}
              onToggle={onToggle}
              onNavigate={onNavigate}
              searchQuery={searchQuery}
            />
          ))}
        </Collapse>
      )}
    </Box>
  )
}

export const FrameworkDetail: React.FC<FrameworkDetailProps> = ({
  framework,
  onBack,
  onUpdate
}) => {
  const { t } = useTranslation()
  
  // Navigation state
  const [currentPath, setCurrentPath] = useState<string[]>([])
  
  // Tree preview state
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  
  // Helper function to get all paths
  const getAllPaths = useCallback((node: FrameworkNode, path: string[] = []): string[] => {
    const paths = [path.join('/')]
    if (node.children) {
      for (const child of node.children) {
        paths.push(...getAllPaths(child, [...path, child.name]))
      }
    }
    return paths
  }, [])
  
  // Auto expand all on mount
  useEffect(() => {
    if (framework.root) {
      setExpanded(new Set(getAllPaths(framework.root)))
    }
  }, [framework.root, getAllPaths])
  
  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [definitionDialogOpen, setDefinitionDialogOpen] = useState(false)
  const [editFrameworkDialogOpen, setEditFrameworkDialogOpen] = useState(false)
  
  // Form state
  const [newNodeName, setNewNodeName] = useState('')
  const [newNodeType, setNewNodeType] = useState<'tier' | 'label'>('tier')
  const [newNodeDefinition, setNewNodeDefinition] = useState('')
  const [nodeToEdit, setNodeToEdit] = useState<FrameworkNode | null>(null)
  const [editName, setEditName] = useState('')
  const [editDefinition, setEditDefinition] = useState('')
  
  // Framework edit state
  const [editFrameworkName, setEditFrameworkName] = useState('')
  const [editFrameworkDescription, setEditFrameworkDescription] = useState('')
  
  // Error state
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  
  // Get current node
  const currentNode = useMemo(() => {
    if (!framework.root) return null
    let node: FrameworkNode | undefined = framework.root
    for (const segment of currentPath) {
      if (!node?.children) return null
      node = node.children.find(c => c.name === segment)
      if (!node) return null
    }
    return node
  }, [framework, currentPath])
  
  // Get children sorted
  const children = useMemo(() => {
    if (!currentNode?.children) return []
    return [...currentNode.children].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'tier' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [currentNode])
  
  // Path string for API
  const currentPathStr = useMemo(() => {
    return [framework.root?.name, ...currentPath].join('/')
  }, [framework, currentPath])
  
  const isCurrentNodeLabel = currentNode?.type === 'label'
  
  // Navigation handlers
  const navigateToRoot = () => setCurrentPath([])
  const navigateToSegment = (index: number) => setCurrentPath(currentPath.slice(0, index))
  const navigateToChild = (name: string) => setCurrentPath([...currentPath, name])
  
  // Tree handlers
  const handleToggle = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }
  
  const handleExpandAll = () => {
    if (framework.root) setExpanded(new Set(getAllPaths(framework.root)))
  }
  
  const handleCollapseAll = () => setExpanded(new Set())
  
  // Add node
  const handleOpenAddDialog = (type: 'tier' | 'label') => {
    setNewNodeType(type)
    setNewNodeName('')
    setNewNodeDefinition('')
    setError(null)
    setAddDialogOpen(true)
  }
  
  const handleAddNode = async () => {
    if (!newNodeName.trim()) return
    setLoading(true)
    setError(null)
    
    try {
      const response = await frameworkApi.addNode(framework.id, {
        parent_path: currentPathStr,
        name: newNodeName.trim(),
        type: newNodeType,
        definition: newNodeDefinition.trim() || undefined
      })
      
      if (response.data?.success && response.data?.data) {
        setAddDialogOpen(false)
        setNewNodeName('')
        setNewNodeDefinition('')
        onUpdate(response.data.data)
      } else {
        setError(response.data?.message || t('framework.addError', '添加失败'))
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || t('framework.addError', '添加失败'))
    } finally {
      setLoading(false)
    }
  }
  
  // Rename node
  const handleOpenRenameDialog = (node: FrameworkNode) => {
    setNodeToEdit(node)
    setEditName(node.name)
    setError(null)
    setRenameDialogOpen(true)
  }
  
  const handleRenameNode = async () => {
    if (!nodeToEdit || !editName.trim()) return
    setLoading(true)
    setError(null)
    
    try {
      const nodePath = [...currentPath, nodeToEdit.name].join('/')
      const fullPath = `${framework.root?.name}/${nodePath}`
      
      const response = await frameworkApi.renameNode(framework.id, {
        node_path: fullPath,
        new_name: editName.trim()
      })
      
      if (response.data?.success && response.data?.data) {
        setRenameDialogOpen(false)
        setNodeToEdit(null)
        onUpdate(response.data.data)
      } else {
        setError(response.data?.message || t('framework.renameError', '重命名失败'))
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || t('framework.renameError', '重命名失败'))
    } finally {
      setLoading(false)
    }
  }
  
  // Delete node
  const handleOpenDeleteDialog = (node: FrameworkNode) => {
    setNodeToEdit(node)
    setError(null)
    setDeleteDialogOpen(true)
  }
  
  const handleDeleteNode = async () => {
    if (!nodeToEdit) return
    setLoading(true)
    setError(null)
    
    try {
      const nodePath = [...currentPath, nodeToEdit.name].join('/')
      const fullPath = `${framework.root?.name}/${nodePath}`
      
      const response = await frameworkApi.deleteNode(framework.id, { node_path: fullPath })
      
      if (response.data?.success && response.data?.data) {
        setDeleteDialogOpen(false)
        setNodeToEdit(null)
        onUpdate(response.data.data)
      } else {
        setError(response.data?.message || t('framework.deleteError', '删除失败'))
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || t('framework.deleteError', '删除失败'))
    } finally {
      setLoading(false)
    }
  }
  
  // Edit definition
  const handleOpenDefinitionDialog = () => {
    if (!currentNode) return
    setEditDefinition(currentNode.definition || '')
    setError(null)
    setDefinitionDialogOpen(true)
  }
  
  const handleUpdateDefinition = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await frameworkApi.updateDefinition(framework.id, {
        node_path: currentPathStr,
        definition: editDefinition.trim()
      })
      
      if (response.data?.success && response.data?.data) {
        setDefinitionDialogOpen(false)
        onUpdate(response.data.data)
      } else {
        setError(response.data?.message || t('framework.updateError', '更新失败'))
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || t('framework.updateError', '更新失败'))
    } finally {
      setLoading(false)
    }
  }
  
  // Edit framework metadata
  const handleOpenEditFrameworkDialog = () => {
    setEditFrameworkName(framework.name)
    setEditFrameworkDescription(framework.description || '')
    setError(null)
    setEditFrameworkDialogOpen(true)
  }
  
  const handleUpdateFramework = async () => {
    if (!editFrameworkName.trim()) return
    setLoading(true)
    setError(null)
    
    try {
      const response = await frameworkApi.update(framework.id, {
        name: editFrameworkName.trim(),
        description: editFrameworkDescription.trim() || undefined
      })
      
      if (response.data?.success && response.data?.data) {
        setEditFrameworkDialogOpen(false)
        onUpdate(response.data.data)
      } else {
        setError(response.data?.message || t('framework.updateError', '更新失败'))
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || t('framework.updateError', '更新失败'))
    } finally {
      setLoading(false)
    }
  }
  
  // Count nodes
  const countNodes = (node: FrameworkNode | undefined): { tiers: number; labels: number } => {
    if (!node) return { tiers: 0, labels: 0 }
    let tiers = node.type === 'tier' ? 1 : 0
    let labels = node.type === 'label' ? 1 : 0
    if (node.children) {
      for (const child of node.children) {
        const c = countNodes(child)
        tiers += c.tiers
        labels += c.labels
      }
    }
    return { tiers, labels }
  }
  
  const stats = countNodes(framework.root)
  
  return (
    <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', p: 2, boxSizing: 'border-box' }}>
      {/* Header */}
      <Paper sx={{ p: 2, mb: 2, flexShrink: 0, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
          <IconButton onClick={onBack} sx={{ flexShrink: 0 }}>
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h5" fontWeight={600} noWrap>
                {framework.name}
              </Typography>
              <Tooltip title={t('framework.editInfo', '编辑框架信息')}>
                <IconButton size="small" onClick={handleOpenEditFrameworkDialog}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Typography variant="body2" color="text.secondary" noWrap sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {framework.description || t('framework.noDescription', '暂无描述')}
            </Typography>
          </Box>
          <Chip label={framework.category} variant="outlined" sx={{ flexShrink: 0 }} />
          <Chip label={`${stats.tiers} ${t('framework.tiers', '层级')}`} color="primary" variant="outlined" sx={{ flexShrink: 0 }} />
          <Chip label={`${stats.labels} ${t('framework.labels', '标签')}`} color="secondary" variant="outlined" sx={{ flexShrink: 0 }} />
        </Box>
      </Paper>
      
      {/* Main content - 使用 CSS Grid 固定布局 */}
      <Box sx={{ 
        flex: 1, 
        minHeight: 0, 
        display: 'grid',
        gridTemplateColumns: '280px 1fr 280px',
        gap: 2,
        width: '100%',
        overflow: 'hidden'
      }}>
        {/* Left: Tree Preview - 固定宽度 */}
        <Paper sx={{ 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'hidden'
        }}>
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="h6">{t('framework.treePreview', '框架树预览')}</Typography>
              <Box>
                <Tooltip title={t('framework.expandAll', '展开全部')}>
                  <IconButton size="small" onClick={handleExpandAll}>
                    <ExpandAllIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('framework.collapseAll', '折叠全部')}>
                  <IconButton size="small" onClick={handleCollapseAll}>
                    <CollapseAllIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
            <TextField
              fullWidth
              size="small"
              placeholder={t('framework.searchNodes', '搜索节点...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
              }}
            />
          </Box>
          <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
            {framework.root && (
              <TreeNodeItem
                node={framework.root}
                path={[]}
                level={0}
                expanded={expanded}
                onToggle={handleToggle}
                onNavigate={setCurrentPath}
                searchQuery={searchQuery}
              />
            )}
          </Box>
        </Paper>
        
        {/* Middle: Node Browser - 弹性填充 */}
        <Paper sx={{ 
          height: '100%', 
          minWidth: 0,
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'hidden' 
        }}>
          {/* Breadcrumb */}
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0, overflow: 'hidden' }}>
            <Breadcrumbs 
              separator={<NavigateNextIcon fontSize="small" />}
              sx={{ 
                '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap' },
                overflow: 'hidden'
              }}
            >
              <Link
                component="button"
                variant="body2"
                onClick={navigateToRoot}
                underline="hover"
                sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                <HomeIcon fontSize="small" sx={{ mr: 0.5 }} />
                {framework.root?.name}
              </Link>
              {currentPath.map((segment, index) => (
                <Link
                  key={index}
                  component="button"
                  variant="body2"
                  onClick={() => navigateToSegment(index + 1)}
                  underline="hover"
                  sx={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  {segment}
                </Link>
              ))}
            </Breadcrumbs>
          </Box>
          
          {/* Current node info */}
          {currentNode && (
            <Box sx={{ px: 2, py: 1, bgcolor: 'action.hover', flexShrink: 0, overflow: 'hidden' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                {currentNode.type === 'tier' ? (
                  <FolderIcon fontSize="small" color="primary" sx={{ flexShrink: 0 }} />
                ) : (
                  <LabelIcon fontSize="small" sx={{ color: currentNode.color, flexShrink: 0 }} />
                )}
                <Typography variant="subtitle2" noWrap sx={{ minWidth: 0 }}>{currentNode.name}</Typography>
                <Chip size="small" label={currentNode.type === 'tier' ? t('framework.tier', '层级') : t('framework.label', '标签')} sx={{ height: 20, fontSize: '0.7rem', flexShrink: 0 }} />
                {currentNode.color && currentNode.type === 'label' && (
                  <Box sx={{ width: 16, height: 16, borderRadius: 0.5, bgcolor: currentNode.color, border: 1, borderColor: 'divider', flexShrink: 0 }} />
                )}
                <Box sx={{ flex: 1, minWidth: 0 }} />
                <Tooltip title={t('framework.editDefinition', '编辑定义')}>
                  <IconButton size="small" onClick={handleOpenDefinitionDialog} sx={{ flexShrink: 0 }}>
                    <DefinitionIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              {currentNode.definition && (
                <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.5, ml: 3.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {currentNode.definition}
                </Typography>
              )}
            </Box>
          )}
            
          <Divider />
          
          {/* Children list */}
          <Box sx={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
            {children.length > 0 ? (
              <List dense disablePadding>
                {children.map((child) => (
                  <ListItem
                    key={child.id || child.name}
                    disablePadding
                    secondaryAction={
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title={t('framework.rename', '重命名')}>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleOpenRenameDialog(child) }}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t('common.delete', '删除')}>
                          <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); handleOpenDeleteDialog(child) }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {child.type === 'tier' && child.children && child.children.length > 0 && (
                          <ArrowRightIcon fontSize="small" color="action" />
                        )}
                      </Box>
                    }
                  >
                    <ListItemButton onClick={() => navigateToChild(child.name)}>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        {child.type === 'tier' ? (
                          <FolderIcon fontSize="small" color="primary" />
                        ) : (
                          <Box sx={{ width: 20, height: 20, borderRadius: 0.5, bgcolor: child.color || 'grey.300', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <LabelIcon sx={{ fontSize: 14, color: 'white' }} />
                          </Box>
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={child.name}
                        secondary={child.type === 'tier' && child.children ? `${child.children.length} ${t('framework.children', '个子节点')}` : undefined}
                        sx={{ '& .MuiListItemText-primary': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            ) : (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">
                  {isCurrentNodeLabel
                    ? t('framework.noChildrenLabel', '标签节点不能包含子节点')
                    : t('framework.noChildren', '此节点暂无子节点')}
                </Typography>
              </Box>
            )}
          </Box>
        </Paper>
        
        {/* Right: Operations - 固定宽度 */}
        <Paper sx={{ 
          height: '100%', 
          p: 2, 
          overflow: 'auto'
        }}>
          <Typography variant="h6" gutterBottom>{t('framework.operations', '节点操作')}</Typography>
          
          <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
            {t('framework.addNode', '添加节点')}
          </Typography>
          
          {/* 层级节点下只能添加标签，标签节点下只能添加层级 */}
          {isCurrentNodeLabel ? (
            <Button 
              fullWidth 
              variant="outlined"
              startIcon={<NewFolderIcon />} 
              onClick={() => handleOpenAddDialog('tier')}
              sx={{ mb: 2 }}
            >
              {t('framework.addTier', '添加层级')}
            </Button>
          ) : (
            <Button 
              fullWidth 
              variant="outlined"
              startIcon={<LabelIcon />} 
              onClick={() => handleOpenAddDialog('label')}
              sx={{ mb: 2 }}
            >
              {t('framework.addLabel', '添加标签')}
            </Button>
          )}
          
          <Divider sx={{ my: 2 }} />
          
          <Typography variant="body2" color="text.secondary" noWrap sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {t('framework.currentPath', '当前路径')}: /{currentPath.join('/')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t('framework.childCount', '子节点数')}: {children.length}
          </Typography>
        </Paper>
      </Box>
      
      {/* Add Node Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {newNodeType === 'tier' ? t('framework.addTier', '添加层级') : t('framework.addLabel', '添加标签')}
        </DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField
            autoFocus
            fullWidth
            label={t('framework.nodeName', '节点名称')}
            value={newNodeName}
            onChange={(e) => setNewNodeName(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
            helperText={newNodeType === 'tier' 
              ? t('framework.tierNameHint', '层级名称将自动转换为大写')
              : t('framework.labelNameHint', '标签名称保持原样，空格转为连字符')}
          />
          <TextField
            fullWidth
            multiline
            rows={3}
            label={t('framework.definition', '定义/描述')}
            value={newNodeDefinition}
            onChange={(e) => setNewNodeDefinition(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)} disabled={loading}>{t('common.cancel', '取消')}</Button>
          <Button variant="contained" onClick={handleAddNode} disabled={!newNodeName.trim() || loading}>{t('common.add', '添加')}</Button>
        </DialogActions>
      </Dialog>
      
      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('framework.renameNode', '重命名节点')}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField
            autoFocus
            fullWidth
            label={t('framework.newName', '新名称')}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)} disabled={loading}>{t('common.cancel', '取消')}</Button>
          <Button variant="contained" onClick={handleRenameNode} disabled={!editName.trim() || loading}>{t('common.save', '保存')}</Button>
        </DialogActions>
      </Dialog>
      
      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t('framework.deleteNodeTitle', '确认删除节点')}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Typography>
            {t('framework.deleteNodeMessage', '确定要删除节点 "{name}" 吗？', { name: nodeToEdit?.name })}
          </Typography>
          {nodeToEdit?.children && nodeToEdit.children.length > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {t('framework.deleteNodeWarning', '此节点包含 {count} 个子节点，将一并删除！', { count: nodeToEdit.children.length })}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={loading}>{t('common.cancel', '取消')}</Button>
          <Button variant="contained" color="error" onClick={handleDeleteNode} disabled={loading}>{t('common.delete', '删除')}</Button>
        </DialogActions>
      </Dialog>
      
      {/* Definition Dialog */}
      <Dialog open={definitionDialogOpen} onClose={() => setDefinitionDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('framework.editDefinition', '编辑定义')}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mt: 1 }}>
            {t('framework.editingNode', '正在编辑节点')}: {currentNode?.name}
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={5}
            label={t('framework.definition', '定义/描述')}
            value={editDefinition}
            onChange={(e) => setEditDefinition(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDefinitionDialogOpen(false)} disabled={loading}>{t('common.cancel', '取消')}</Button>
          <Button variant="contained" onClick={handleUpdateDefinition} disabled={loading}>{t('common.save', '保存')}</Button>
        </DialogActions>
      </Dialog>
      
      {/* Edit Framework Dialog */}
      <Dialog open={editFrameworkDialogOpen} onClose={() => setEditFrameworkDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('framework.editInfo', '编辑框架信息')}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField
            autoFocus
            fullWidth
            label={t('framework.name', '框架名称')}
            value={editFrameworkName}
            onChange={(e) => setEditFrameworkName(e.target.value)}
            sx={{ mt: 2, mb: 2 }}
            helperText={t('framework.nameChangeHint', '修改名称将同时更新文件名')}
          />
          <TextField
            fullWidth
            multiline
            rows={3}
            label={t('framework.description', '描述')}
            value={editFrameworkDescription}
            onChange={(e) => setEditFrameworkDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditFrameworkDialogOpen(false)} disabled={loading}>{t('common.cancel', '取消')}</Button>
          <Button variant="contained" onClick={handleUpdateFramework} disabled={!editFrameworkName.trim() || loading}>{t('common.save', '保存')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default FrameworkDetail

