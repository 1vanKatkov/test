from pydantic import BaseModel, Field


class SonnikRequest(BaseModel):
    dream_text: str = Field(min_length=3, max_length=4000)
    language: str = Field(default="", max_length=8)


class NumerologyRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    birth_date: str = Field(min_length=10, max_length=10)
    language: str = Field(default="", max_length=8)


class SovmestimostNamesRequest(BaseModel):
    name1: str = Field(min_length=2, max_length=100)
    name2: str = Field(min_length=2, max_length=100)
    language: str = Field(default="", max_length=8)


class SovmestimostNamesDatesRequest(BaseModel):
    name1: str = Field(min_length=2, max_length=100)
    date1: str = Field(min_length=8, max_length=10)
    name2: str = Field(min_length=2, max_length=100)
    date2: str = Field(min_length=8, max_length=10)
    language: str = Field(default="", max_length=8)


class EmailRegisterStartRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    password_confirm: str = Field(min_length=8, max_length=128)
    language: str = Field(default="ru", max_length=8)


class EmailRegisterVerifyRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    code: str = Field(min_length=6, max_length=6)
    language: str = Field(default="ru", max_length=8)


class EmailLoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=8, max_length=128)


class EmailResendRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    language: str = Field(default="ru", max_length=8)


class EmailPasswordResetConfirmRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8, max_length=128)
    password_confirm: str = Field(min_length=8, max_length=128)


class TelegramVerifyRequest(BaseModel):
    init_data: str = Field(min_length=20, max_length=8000)


class TelegramLinkVerifyRequest(BaseModel):
    link_token: str = Field(min_length=20, max_length=12000)


class TelegramMintUsernameLinkRequest(BaseModel):
    username: str = Field(min_length=1, max_length=32)


class SupportCreateTicketRequest(BaseModel):
    subject: str = Field(min_length=3, max_length=200)
    message_text: str = Field(min_length=3, max_length=4000)


class SupportAddMessageRequest(BaseModel):
    message_text: str = Field(min_length=1, max_length=4000)


class YooKassaCreatePaymentRequest(BaseModel):
    package_id: str = Field(min_length=3, max_length=64)
    receipt_email: str = Field(min_length=5, max_length=254)


class AdminAdjustCreditsRequest(BaseModel):
    user_id: int = Field(gt=0)
    amount: int = Field(ge=-100000, le=100000)
    reason: str = Field(default="admin_adjustment", min_length=1, max_length=200)

