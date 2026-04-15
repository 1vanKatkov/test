from pydantic import BaseModel, Field


class SonnikRequest(BaseModel):
    dream_text: str = Field(min_length=3, max_length=4000)


class NumerologyRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    birth_date: str = Field(min_length=10, max_length=10)


class SovmestimostNamesRequest(BaseModel):
    name1: str = Field(min_length=2, max_length=100)
    name2: str = Field(min_length=2, max_length=100)


class SovmestimostNamesDatesRequest(BaseModel):
    name1: str = Field(min_length=2, max_length=100)
    date1: str = Field(min_length=8, max_length=10)
    name2: str = Field(min_length=2, max_length=100)
    date2: str = Field(min_length=8, max_length=10)


class TelegramVerifyRequest(BaseModel):
    init_data: str = Field(min_length=20, max_length=8000)


class EmailRegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=6, max_length=128)
    username: str = Field(default="", max_length=100)
    language: str = Field(default="ru", max_length=8)


class EmailLoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=6, max_length=128)


class SupportCreateTicketRequest(BaseModel):
    subject: str = Field(min_length=3, max_length=200)
    message_text: str = Field(min_length=3, max_length=4000)


class SupportAddMessageRequest(BaseModel):
    message_text: str = Field(min_length=1, max_length=4000)


class YooKassaCreatePaymentRequest(BaseModel):
    package_id: str = Field(min_length=3, max_length=64)
    receipt_email: str = Field(min_length=5, max_length=254)

