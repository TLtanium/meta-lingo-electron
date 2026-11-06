"""Read only native ordering for the specified test process, never window titles."""
import ctypes as c,json,sys,plistlib
cg=c.CDLL('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')
cf=c.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
cg.CGWindowListCopyWindowInfo.argtypes=[c.c_uint32,c.c_uint32];cg.CGWindowListCopyWindowInfo.restype=c.c_void_p
cf.CFPropertyListCreateData.argtypes=[c.c_void_p,c.c_void_p,c.c_int,c.c_uint64,c.c_void_p];cf.CFPropertyListCreateData.restype=c.c_void_p
cf.CFDataGetLength.argtypes=[c.c_void_p];cf.CFDataGetLength.restype=c.c_long
cf.CFDataGetBytePtr.argtypes=[c.c_void_p];cf.CFDataGetBytePtr.restype=c.c_void_p
cf.CFRelease.argtypes=[c.c_void_p]
array=cg.CGWindowListCopyWindowInfo(1|16,0)
if not array:raise RuntimeError('Native window list unavailable')
data=cf.CFPropertyListCreateData(None,array,100,0,None)
try:
 windows=plistlib.loads(c.string_at(cf.CFDataGetBytePtr(data),cf.CFDataGetLength(data)))
 pid=int(sys.argv[1]);print(json.dumps([{'id':w['kCGWindowNumber'],'layer':w.get('kCGWindowLayer'),'onscreen':w.get('kCGWindowIsOnscreen'),'bounds':w.get('kCGWindowBounds')} for w in windows if w.get('kCGWindowOwnerPID')==pid]))
finally:cf.CFRelease(data);cf.CFRelease(array)
