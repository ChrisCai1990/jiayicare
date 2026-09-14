"""Official Finance SDK adapter. JSON stdin/stdout are private pipes, never logs."""
import base64
import ctypes as c
import json
import os
import subprocess
import sys


def run(request):
    root = os.environ.get('WECOM_ARCHIVE_KEY_DIR', '/var/lib/jiayicare/wecom-archive')
    lib = c.CDLL(os.path.join(root, 'sdk', 'libWeWorkFinanceSdk_C.so'))
    for name in ['NewSdk', 'NewSlice', 'NewMediaData']:
        getattr(lib, name).restype = c.c_void_p
    signatures = {
        'Init': [c.c_void_p, c.c_char_p, c.c_char_p],
        'GetChatData': [c.c_void_p, c.c_ulonglong, c.c_uint, c.c_char_p, c.c_char_p, c.c_int, c.c_void_p],
        'DecryptData': [c.c_char_p, c.c_char_p, c.c_void_p],
        'GetMediaData': [c.c_void_p, c.c_char_p, c.c_char_p, c.c_char_p, c.c_char_p, c.c_int, c.c_void_p],
    }
    for name, args in signatures.items():
        getattr(lib, name).argtypes = args
    for name in ['FreeSlice', 'DestroySdk', 'FreeMediaData', 'GetContentFromSlice', 'GetData', 'GetDataLen', 'GetOutIndexBuf', 'IsMediaDataFinish']:
        getattr(lib, name).argtypes = [c.c_void_p]
    lib.GetContentFromSlice.restype = c.c_char_p
    lib.GetOutIndexBuf.restype = c.c_char_p
    lib.GetData.restype = c.c_void_p
    sdk = lib.NewSdk()
    try:
        if lib.Init(sdk, os.environ['WECOM_CORP_ID'].encode(), os.environ['WECOM_ARCHIVE_SECRET'].encode()):
            raise RuntimeError('sdk_init')
        if request.get('action') == 'media':
            chunks, size, index = [], 0, b''
            for _ in range(64):
                media = lib.NewMediaData()
                try:
                    if lib.GetMediaData(sdk, index, request['fileId'].encode(), b'', b'', 20, media):
                        raise RuntimeError('media_fetch')
                    size += lib.GetDataLen(media)
                    if size > 9 * 1024 * 1024:
                        return {'tooLarge': True}
                    chunks.append(c.string_at(lib.GetData(media), lib.GetDataLen(media)))
                    if lib.IsMediaDataFinish(media):
                        return {'base64': base64.b64encode(b''.join(chunks)).decode()}
                    index = lib.GetOutIndexBuf(media)
                finally:
                    lib.FreeMediaData(media)
            raise RuntimeError('media_chunks')
        data = lib.NewSlice()
        try:
            rc = lib.GetChatData(sdk, int(request.get('seq', 0)), 20, b'', b'', 20, data)
            if rc:
                raise RuntimeError('chat_fetch_' + str(rc))
            response = json.loads(lib.GetContentFromSlice(data))
        finally:
            lib.FreeSlice(data)
        if response.get('errcode'):
            raise RuntimeError('chat_api_' + str(response['errcode']))
        result = []
        for row in response.get('chatdata', []):
            version = int(row['publickey_ver'])
            key = os.path.join(root, 'private.pem' if version == 1 else 'private-v%d.pem' % version)
            decrypted = subprocess.run(['openssl', 'pkeyutl', '-decrypt', '-inkey', key,
                '-pkeyopt', 'rsa_padding_mode:pkcs1'], input=base64.b64decode(row['encrypt_random_key']), capture_output=True)
            if decrypted.returncode:
                raise RuntimeError('private_key_version_' + str(version))
            data = lib.NewSlice()
            try:
                if lib.DecryptData(decrypted.stdout, row['encrypt_chat_msg'].encode(), data):
                    raise RuntimeError('decrypt_failed')
                result.append({'seq': row['seq'], 'message': json.loads(lib.GetContentFromSlice(data))})
            finally:
                lib.FreeSlice(data)
        return {'rows': result}
    finally:
        lib.DestroySdk(sdk)


if __name__ == '__main__':
    try:
        print(json.dumps(run(json.load(sys.stdin))))
    except Exception as error:
        # SDK/network responses can contain sensitive data. Only fixed codes leave this process.
        code = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        print(json.dumps({'error': code}))
        sys.exit(1)
