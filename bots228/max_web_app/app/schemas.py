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


class TarotRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
    spread_size: int = Field(default=3)
