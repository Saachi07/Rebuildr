class CaseError(Exception):
    def __init__(self, code: str, message: str, details: dict = None, status: int = 400):
        self.code = code
        self.message = message
        self.details = details or {}
        self.status = status
        super().__init__(message)


def case_error(code: str, message: str, details: dict = None, status: int = 400):
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or {},
        }
    }, status
