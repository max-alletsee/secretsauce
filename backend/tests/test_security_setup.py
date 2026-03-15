# backend/tests/test_security_setup.py


def test_security_module_exports_expected_names():
    from app.core.security import (
        UserManager,
        auth_backend,
        current_active_user,
        current_superuser,
        fastapi_users,
        get_jwt_strategy,
        get_user_db,
        get_user_manager,
    )
    assert fastapi_users is not None
    assert auth_backend is not None
