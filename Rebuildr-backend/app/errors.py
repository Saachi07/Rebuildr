class CaseError(Exception):
    def __init__(self, code: str, message: str, details: dict | None = None, status: int = 400):
        self.code = code
        self.message = message
        self.details = details or {}
        self.status = status
        super().__init__(message)

    def to_response(self):
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details,
            }
        }, self.status


def case_error(code: str, message: str, details: dict | None = None, status: int = 400):
    return CaseError(code, message, details, status).to_response()
